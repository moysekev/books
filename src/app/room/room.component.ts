import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';

import firebase from 'firebase';
import 'firebase/database';
import 'firebase/firestore';

@Component({
  selector: 'app-room',
  templateUrl: './room.component.html',
  styleUrls: ['./room.component.css']
})
export class RoomComponent implements OnInit, OnDestroy {

  static
    configuration = {
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

  roomId: string = 'TEST';
  localPeerId: string;
  localStream: MediaStream = null;
  peers: Array<any> = [];
  peerConnections: Array<RTCPeerConnection> = [];

  constructor() { }

  ngOnInit(): void {
  }

  ngOnDestroy(): void {
    this.doHangUp();
  }

  removePeer(id: string) {
    for (var i = 0; i < this.peers.length; i++) {
      if (this.peers[i]['id'] === id) {
        this.peers.splice(i, 1);
      }
    }
  }

  private listen() {
    firebase.database().ref('/rooms').child(this.roomId).child('peers').on("child_removed", (snapshot: any) => {
      const peer = snapshot.val();
      console.log(`Child ${peer.id} removed`);
      this.removePeer(peer.id);

      // cleanup database
      firebase.database().ref("/rooms").child(this.roomId).child(this.localPeerId).child(peer.id).remove();
    });

    firebase.database().ref('/rooms').child(this.roomId).child('peers').on("child_added", (snapshot) => {
      const peer: any = snapshot.val();
      console.log('PEER', peer);
      if (peer.id !== this.localPeerId) {
        this.peers.push(peer);
      }

      // listen to offer from remote TO peer
      firebase.database().ref(`/rooms/${this.roomId}/${peer.id}/${this.localPeerId}/offer`).on("value", (snapshot) => {
        const offer = snapshot.val();
        if (offer == null) {
          console.log("OFFER : NULL");
          return;
        }
        console.log(`OFFER ${peer.id}/${this.localPeerId} : `, offer);

        const peerConnection = new RTCPeerConnection(RoomComponent.configuration);
        this.peerConnections.push(peerConnection);
        RoomComponent.registerPeerConnectionListeners(peerConnection);

        this.localStream.getTracks().forEach(track => {
          //console.log('TRACK:', track);
          // TRACK: 
          // MediaStreamTrack { kind: "audio", id: "{498af056-db75-47de-881b-297ea612f622}", label: "Audio interne Stéréo analogique", enabled: true, muted: false, onmute: null, onunmute: null, readyState: "live", onended: null }
          // TRACK: 
          // MediaStreamTrack { kind: "video", id: "{e5676a77-7099-4b3f-82ea-108a90e7c029}", label: "Integrated_Webcam_HD: Integrate", enabled: true, muted: false, onmute: null, onunmute: null, readyState: "live", onended: null }
          peerConnection.addTrack(track, this.localStream);
        });

        peerConnection.addEventListener('icecandidate', event => {
          if (!event.candidate) {
            console.log('Got final candidate!');
            return;
          }
          console.log('Got candidate: ', event.candidate);

          firebase.database().ref('/rooms').child(this.roomId).child(this.localPeerId).child(peer.id).child('calleeICE').push().set(event.candidate.toJSON());
        });

        // Code for creating SDP answer below
        peerConnection.setRemoteDescription(new RTCSessionDescription(offer)).then(() => {
          const offerOption: RTCOfferOptions = <RTCOfferOptions>{ offerToReceiveAudio: true, offerToReceiveVideo: true };
          peerConnection.createAnswer(offerOption).then(answer => {
            console.log('setLocalDescription:', answer);
            peerConnection.setLocalDescription(answer);

            const db_answer = {
              type: answer.type,
              sdp: answer.sdp,
            };
            firebase.database().ref('/rooms').child(this.roomId).child(peer.id).child(this.localPeerId).child('answer').update(db_answer).then(() => {
              console.log(`DB ANSWER. Room ID: <${this.roomId}>`);
            });

            // Listening for remote ICE candidates below
            firebase.database().ref('/rooms').child(this.roomId).child(peer.id).child(this.localPeerId).child('callerICE').on("child_added", (snapshot) => {
              console.log('callerICE', snapshot.val());
              peerConnection.addIceCandidate(new RTCIceCandidate(snapshot.val()));
            });
            // Listening for remote ICE candidates above

          });
        });
      });
    });
  }

  public static uuidv4() {
    return 'xxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    // return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    // 	var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    // 	return v.toString(16);
    // });
  }

  capture(): void {
    // I noticed that it is important to getUserMedia and stream BEFORE
    // creating and register to events on RTCPeerConnection.
    // Otherwise the connection is not made for some reason, and we don't see the remote video
    navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    }).then(stream => {
      this.localStream = stream;
      //this.localVideoRef.nativeElement.autoplay = true;
      // Seems this has to be set by code to work :
      this.localVideoRef.nativeElement.muted = true;
      // Attach stream
      this.localVideoRef.nativeElement.srcObject = stream;
    });
  }

  create(): void {
    const id = this.roomId;
    firebase.database().ref('/rooms').child(id).remove()
      .then(() => {
        console.log("Remove succeeded.")

        const peerId = RoomComponent.uuidv4();
        this.localPeerId = peerId;
        console.log(`_peerId=(${peerId})`);
        firebase.database().ref('/rooms').child(id).child('peers').push().set({ id: peerId });

        this.listen();
      })
      .catch((error) => {
        console.log("Remove failed: " + error.message)
      });
  }

  join(): void {
    const id = this.roomId;
    console.log(`::join(${id})`);

    const peerId = RoomComponent.uuidv4();
    this.localPeerId = peerId;
    console.log(`_peerId=(${peerId})`);
    firebase.database().ref('/rooms').child(id).child('peers').push().set({ id: peerId });

    this.listen();
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
      });
  }

  private doHangUp() {
    this.localStream.getTracks().forEach(track => {
      track.stop();
    });
    this.localVideoRef.nativeElement.srcObject = null;

    while (this.peerConnections.length) {
      var peerConnection = this.peerConnections.pop();
      peerConnection.close();
    }

    // empty peers
    this.peers.length = 0;

    RoomComponent.deletePeerFromDBList(this.roomId, this.localPeerId);

    // clean up database
    firebase.database().ref("/rooms").child(this.roomId).child(this.localPeerId).remove();

    // it is important to unregister from the 'on' set on peers because if user hangs up and rejoin/recreate
    // it would add listeners while some are already set and would trigger unexpected results
    firebase.database().ref('/rooms').child(this.roomId).child('peers').off();

    // reset local peer Id only at the end because it is used in previous lines
    this.localPeerId = null;
  }

  hangup(): void {
    this.doHangUp();
  }

  static registerPeerConnectionListeners(peerConnection: RTCPeerConnection) {
    peerConnection.addEventListener('icegatheringstatechange', () => {
      console.log(
        `ICE gathering state changed: ${peerConnection.iceGatheringState}`);
    });

    peerConnection.addEventListener('connectionstatechange', () => {
      console.log(`Connection state change: ${peerConnection.connectionState}`);
    });

    peerConnection.addEventListener('signalingstatechange', () => {
      console.log(`Signaling state change: ${peerConnection.signalingState}`);
    });

    peerConnection.addEventListener('iceconnectionstatechange ', () => {
      console.log(
        `ICE connection state change: ${peerConnection.iceConnectionState}`);
    });
  }

}
