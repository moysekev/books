import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, HostListener } from '@angular/core';
import { ActivatedRoute } from "@angular/router";
import { FormControl } from '@angular/forms';

import firebase from 'firebase';
import 'firebase/database';
import 'firebase/firestore';

@Component({
  selector: 'app-room',
  templateUrl: './room.component.html',
  styleUrls: ['./room.component.css']
})
export class RoomComponent implements OnInit, AfterViewInit, OnDestroy {

  static configuration = {
    iceServers: [
      {
        urls: [
          'stun:stun1.l.google.com:19302',
          'stun:stun2.l.google.com:19302',
        ],
      },
    ],
    iceCandidatePoolSize: 10,
  };

  @ViewChild("localVideo") localVideoRef: ElementRef;

  name = new FormControl('');

  roomId: string;
  localPeerId: string;
  localStream: MediaStream = null;
  peers: Array<any> = [];
  page: Array<any> = [];

  nbPeersPerPage = 2;

  constructor(private route: ActivatedRoute) {
    this.name.valueChanges.subscribe((selectedValue) => {
      console.log(selectedValue);
      console.log("Name change " + this.name.value);
      firebase.database().ref(`/rooms/${this.roomId}/${this.localPeerId}`).child('name').set(this.name.value);
    });
    this.name.registerOnChange(() => {
    });
  }

  // Note : beforeUnloadHandler alone does not work on android Chrome
  // seems it requires unloadHandler to do the same to work evrywhere...
  // https://stackoverflow.com/questions/35779372/window-onbeforeunload-doesnt-trigger-on-android-chrome-alt-solution
  //
  @HostListener('window:unload', ['$event'])
  unloadHandler(event) {
    console.log("unloadHandler");
    this.doHangUp();
  }

  // Use BEFORE unload to hangup (works for Firefox at least)
  // This is usefull if user closes the tab, or refreshes the page
  @HostListener('window:beforeunload', ['$event'])
  beforeUnloadHandler(event) {
    console.log("beforeUnloadHandler");
    this.doHangUp();
  }

  ngOnInit(): void {
    this.roomId = this.route.snapshot.paramMap.get("id");
    this.localPeerId = RoomComponent.uuidv4();
  }

  ngAfterViewInit() {
    navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    }).then((stream: MediaStream) => {
      this.localStream = stream;
      //this.localVideoRef.nativeElement.autoplay = true;
      // Seems this has to be set by code to work :
      this.localVideoRef.nativeElement.muted = true;
      // Attach stream
      this.localVideoRef.nativeElement.srcObject = stream;
      this.join();
    }).catch(err => {
      console.log("getUserMedia error", err);
      //alert("getUserMedia not supported by your web browser or Operating system version" + err);
    });
  }

  join(): void {
    console.log(`join(), localPeerId<${this.localPeerId}>`);
    firebase.database().ref('/rooms').child(this.roomId).child('peers').push().set({ id: this.localPeerId });
    this.listen();
  }

  ngOnDestroy(): void {
    this.doHangUp();
  }

  private removePeer(id: string) {
    for (var i = 0; i < this.peers.length; i++) {
      if (this.peers[i]['id'] === id) {
        const removed = this.peers.splice(i, 1);
        const removedPeer = removed[0];

        if (removedPeer.onOffer) {
          console.log(`ROOM offing ${removedPeer.id}/${this.localPeerId} onOffer`);
          firebase.database().ref(`/rooms/${this.roomId}/${removedPeer.id}/${this.localPeerId}/offer`).off("value", removedPeer.onOffer);
          delete removedPeer.onOffer;
        }
        if (removedPeer.onCallerICE) {
          console.log(`ROOM offing ${removedPeer.id}/${this.localPeerId} onCallerICE`);
          firebase.database().ref('/rooms').child(this.roomId).child(removedPeer.id).child(this.localPeerId).child('callerICE').off("child_added", removedPeer.onCallerICE);
          delete removedPeer.onCallerICE;
        }

        if (removedPeer.rtcPeerConnection) {
          console.log(`CLOSING RTCPeerConnection for removed PeerPeer<${removedPeer.id}>`);
          removedPeer.rtcPeerConnection.close();
          delete removedPeer.rtcPeerConnection;
        }
      }
    }
    console.log(`Removed Peer<${id}>`);
  }

  private replacePeer(id: string, peer: any) {
    for (var i = 0; i < this.peers.length; i++) {
      if (this.peers[i]['id'] === id) {
        this.peers[i] = peer;
      }
    }
    console.log(`Replaced Peer<${id}>`);
  }

  private addPeer(peer: any) {
    if (this.peers.length >= this.nbPeersPerPage) {
      // replace last peer of the page by new one
      // so that any new comer is displayed
      const peerToHide = this.peers[this.nbPeersPerPage - 1];

      //this.replacePeer(peerToHide.id, peer);
      this.peers.splice(this.nbPeersPerPage - 1, 0, peer);

      if (peerToHide.onOffer) {
        console.log(`ROOM offing ${peerToHide.id}/${this.localPeerId} onOffer`);
        firebase.database().ref(`/rooms/${this.roomId}/${peerToHide.id}/${this.localPeerId}/offer`).off("value", peerToHide.onOffer);
        delete peerToHide.onOffer;
      }
      if (peerToHide.onCallerICE) {
        console.log(`ROOM offing ${peerToHide.id}/${this.localPeerId} onCallerICE`);
        firebase.database().ref('/rooms').child(this.roomId).child(peerToHide.id).child(this.localPeerId).child('callerICE').off("child_added", peerToHide.onCallerICE);
        delete peerToHide.onCallerICE;
      }

      // since the replaced peer is no more displayed, close corresponding rtcPeerConnection
      if (peerToHide.rtcPeerConnection) {
        console.log(`CLOSING RTCPeerConnection for replaced Peer<${peerToHide.id}>`);
        peerToHide.rtcPeerConnection.close();
        // then delete property so that if peer goes back in page we know that we should recreate a connection
        // for it
        delete peerToHide.rtcPeerConnection;
      }

      // setting back peerToHide at end of peers
      //this.peers.push(peerToHide);
    }
    else {
      this.peers.push(peer);
    }
  }

  private connectPagePeers() {
    for (const peer of this.page) {
      if (!peer.rtcPeerConnection) {
        this.connectToPeer(peer);
      }
    }
  }

  private connectToPeer(peer: any) {

    const onOffer = (snapshot: any) => {
      const offer = snapshot.val();
      if (offer == null) {
        console.log("OFFER : NULL");
        return;
      }
      console.log(`Peer<${peer.id}> OFFER from ${this.localPeerId} : `, offer);

      const peerConnection = new RTCPeerConnection(RoomComponent.configuration);
      // store rtcPeerConnection into peer
      peer.rtcPeerConnection = peerConnection;
      //this.peerConnections.push(peerConnection);
      RoomComponent.registerPeerConnectionListeners(peerConnection, peer.id);

      this.localStream.getTracks().forEach(track => {
        console.log(`Peer<${peer.id}> track`, track);
        // TRACK: 
        // MediaStreamTrack { kind: "audio", id: "{498af056-db75-47de-881b-297ea612f622}", label: "Audio interne Stéréo analogique", enabled: true, muted: false, onmute: null, onunmute: null, readyState: "live", onended: null }
        // TRACK: 
        // MediaStreamTrack { kind: "video", id: "{e5676a77-7099-4b3f-82ea-108a90e7c029}", label: "Integrated_Webcam_HD: Integrate", enabled: true, muted: false, onmute: null, onunmute: null, readyState: "live", onended: null }
        peerConnection.addTrack(track, this.localStream);
      });

      peerConnection.addEventListener('icecandidate', event => {
        if (!event.candidate) {
          console.log(`Peer<${peer.id}> Got final candidate!`);
          return;
        }
        console.log(`Peer<${peer.id}> Got candidate: `, event.candidate);

        firebase.database().ref('/rooms').child(this.roomId).child(this.localPeerId).child(peer.id).child('calleeICE').push().set(event.candidate.toJSON());
      });

      // Code for creating SDP answer below
      peerConnection.setRemoteDescription(offer).then(() => {
        const options: RTCOfferOptions = <RTCOfferOptions>{ offerToReceiveAudio: true, offerToReceiveVideo: true };
        peerConnection.createAnswer(options).then(answer => {
          console.log(`Peer<${peer.id}> setLocalDescription:`, answer);
          peerConnection.setLocalDescription(answer).then().catch((error) => {
            console.error("setLocalDescription(answer) CAUGHT : " + error);
          });
          const db_answer = {
            type: answer.type,
            sdp: answer.sdp,
          };
          firebase.database().ref('/rooms').child(this.roomId).child(peer.id).child(this.localPeerId).child('answer').update(db_answer).then(() => {
            console.log(`Peer<${peer.id}> DB ANSWER. Room ID: <${this.roomId}>`);
          }).catch((error) => {
            console.error("CAUGHT" + error);
          });

          // Listening for remote ICE candidates below
          const onCallerICE = (snapshot: any) => {
            console.log('callerICE', snapshot.val());
            peerConnection.addIceCandidate(new RTCIceCandidate(snapshot.val()));
          };
          peer.onCallerICE = onCallerICE;
          firebase.database().ref('/rooms').child(this.roomId).child(peer.id).child(this.localPeerId).child('callerICE').on("child_added", onCallerICE);
          // Listening for remote ICE candidates above 

        }).catch((error) => {
          console.error("CAUGHT" + error);
        });
      }).catch((error) => {
        console.error("CAUGHT" + error);
      });
    };

    peer.onOffer = onOffer;

    // listen to offer from remote TO peer
    firebase.database().ref(`/rooms/${this.roomId}/${peer.id}/${this.localPeerId}/offer`).on("value", onOffer);
  }

  private on_child_removed: any;
  private on_child_added: any;

  private listen() {

    this.on_child_removed = (snapshot: any) => {
      const peer = snapshot.val();
      console.log(`Child ${peer.id} removed`);
      this.removePeer(peer.id);
      this.page = this.peers.slice(0, Math.min(this.nbPeersPerPage, this.peers.length));
      this.connectPagePeers();
      // cleanup database
      firebase.database().ref("/rooms").child(this.roomId).child(this.localPeerId).child(peer.id).remove();
    };
    firebase.database().ref('/rooms').child(this.roomId).child('peers').on("child_removed", this.on_child_removed);

    this.on_child_added = (snapshot: any) => {
      const peer: any = snapshot.val();
      console.log('PEER', peer);
      if (peer.id !== this.localPeerId) {
        //this.peers.push(peer);
        this.addPeer(peer);
        this.page = this.peers.slice(0, Math.min(this.nbPeersPerPage, this.peers.length));
        this.connectPagePeers();
      }
    };
    firebase.database().ref('/rooms').child(this.roomId).child('peers').on("child_added", this.on_child_added);
  }

  public static uuidv4() {
    // return 'xxxx'.replace(/[xy]/g, function (c) {
    //   var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    //   return v.toString(16);
    // });
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  capture(): void {
    // I noticed that it is important to getUserMedia and stream BEFORE
    // creating and register to events on RTCPeerConnection.
    // Otherwise the connection is not made for some reason, and we don't see the remote video
    navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    }).then((stream: MediaStream) => {
      this.localStream = stream;
      //this.localVideoRef.nativeElement.autoplay = true;
      // Seems this has to be set by code to work :
      this.localVideoRef.nativeElement.muted = true;
      // Attach stream
      this.localVideoRef.nativeElement.srcObject = stream;
    }).catch((error) => {
      console.error("CAUGHT" + error);
    });
  }

  static deletePeerFromDBList(roomId: string, id: string) {
    var query = firebase.database().ref("/rooms").child(roomId).child('peers').orderByKey();
    query.once("value")
      .then((snapshot) => {
        snapshot.forEach((childSnapshot) => {
          var pkey = childSnapshot.key;
          var chval = childSnapshot.val();

          //check if remove this child
          if (chval.id === id) {
            firebase.database().ref("/rooms").child(roomId).child('peers').child(pkey).remove();
            console.log(`Removed Peer<${id}> at key ${pkey}`);
            return true;
          }
        });
      }).catch((error) => {
        console.error("CAUGHT" + error);
      });
  }

  private doHangUp() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
      });
    }
    this.localVideoRef.nativeElement.srcObject = null;

    this.page.length = 0;

    // clean up database
    if (this.roomId && this.localPeerId) {
      RoomComponent.deletePeerFromDBList(this.roomId, this.localPeerId);
      firebase.database().ref("/rooms").child(this.roomId).child(this.localPeerId).remove();
    }

    // it is important to unregister from the 'on' set on peers because if user hangs up and rejoin/recreate
    // it would add listeners while some are already set and would trigger unexpected results
    if (this.roomId) {
      console.log('Offing from peers child_removed, child_added');
      firebase.database().ref('/rooms').child(this.roomId).child('peers').off('child_removed', this.on_child_removed);
      firebase.database().ref('/rooms').child(this.roomId).child('peers').off('child_added', this.on_child_added);
    }

    // REPLACED BY :
    // empty peers, closing rtcPeerConnection in the meantime
    while (this.peers.length) {
      const peer = this.peers.pop();
      if (peer.rtcPeerConnection) {
        console.log("CLOSING RTCPeerConnection for " + peer.id);
        peer.rtcPeerConnection.close();
      }
    }

    // reset local peer Id only at the end because it is used in previous lines
    this.localPeerId = null;
  }

  hangup(): void {
    this.doHangUp();
  }

  static registerPeerConnectionListeners(peerConnection: RTCPeerConnection, id: string) {
    peerConnection.addEventListener('icegatheringstatechange', () => {
      console.log(
        `CONNECTION<${id}> ICE gathering state changed: ${peerConnection.iceGatheringState}`);
    });

    peerConnection.addEventListener('connectionstatechange', () => {
      console.log(`CONNECTION<${id}> Connection state change: ${peerConnection.connectionState}`);
    });

    peerConnection.addEventListener('signalingstatechange', () => {
      console.log(`CONNECTION<${id}> Signaling state change: ${peerConnection.signalingState}`);
    });

    peerConnection.addEventListener('iceconnectionstatechange ', () => {
      console.log(
        `CONNECTION<${id}> ICE connection state change: ${peerConnection.iceConnectionState}`);
    });
  }

}
