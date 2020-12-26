import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';

import firebase from 'firebase';
import 'firebase/database';
import 'firebase/firestore';

@Component({
  selector: 'app-room',
  templateUrl: './room.component.html',
  styleUrls: ['./room.component.css']
})
export class RoomComponent implements OnInit {

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

  peerConnection: RTCPeerConnection;
  localStream: MediaStream = null;
  remoteStream: MediaStream = null;

  @ViewChild("localVideo") localVideoRef: ElementRef;
  @ViewChild("remoteVideo") remoteVideoRef: ElementRef;

  //db = firebase.firestore();

  id: string = null;

  peers: Array<any> = [];

  constructor() { }

  ngOnInit(): void {
  }

  // capture(): Promise<MediaStream> {
  //   return navigator.mediaDevices.getUserMedia({
  //     video: true,
  //     audio: true
  //   });
  // }

  // createOffer(peerConnection: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
  //   return peerConnection.createOffer();
  // }

  public uuidv4() {
    return 'xxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    // return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    // 	var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    // 	return v.toString(16);
    // });
  }

  create(): void {

    // I noticed that it is important to getUserMedia and stream BEFORE
    // creating and register to events on RTCPeerConnection.
    // Otherwise the connection is not made for some reason, and we don't see the remote video
    navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    }).then(stream => {
      this.localStream = stream;
      this.localVideoRef.nativeElement.autoplay = true;
      this.localVideoRef.nativeElement.muted = false;
      // Attach stream
      this.localVideoRef.nativeElement.srcObject = stream;

      //document.querySelector('#localVideo').srcObject = stream;

      //const id = this.uuidv4();
      this.id = 'TEST';
      const id = this.id;

      firebase.database().ref('/rooms').child(id).remove()
        .then(() => {
          console.log("Remove succeeded.")
          firebase.database().ref('/rooms').child(id).child('peers').on("child_added", (snapshot) => {
            const peer: any = snapshot.val();
            console.log('PEER', peer);
            this.peers.push(peer);
          });
        })
        .catch((error) => {
          console.log("Remove failed: " + error.message)
        });
    });
  }

  join(): void {

    navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    }).then(stream => {
      // Local stream
      this.localStream = stream;
      this.localVideoRef.nativeElement.autoplay = true;
      this.localVideoRef.nativeElement.muted = false;
      this.localVideoRef.nativeElement.srcObject = stream;

      // join room with id
      const id = 'TEST';
      console.log(`::join(${id})`);

      const peerId = this.uuidv4();
      console.log(`_peerId=(${peerId})`);
      firebase.database().ref('/rooms').child(id).child('peers').push().set({ id: peerId });

      //firebase.database().ref('/rooms').child(id).child(peerId).child('READY').once("value", (snapshot) => {

      firebase.database().ref(`/rooms/${id}/${peerId}/offer`).on("value", (snapshot) => {
        const offer = snapshot.val();
        if (offer == null) {
          console.log("OFFER : NULL");
          return;
        }
        console.log("OFFER : ", offer);

        this.peerConnection = new RTCPeerConnection(this.configuration);
        RoomComponent.registerPeerConnectionListeners(this.peerConnection);

        this.localStream.getTracks().forEach(track => {
          //console.log('TRACK:', track);
          // TRACK: 
          // MediaStreamTrack { kind: "audio", id: "{498af056-db75-47de-881b-297ea612f622}", label: "Audio interne Stéréo analogique", enabled: true, muted: false, onmute: null, onunmute: null, readyState: "live", onended: null }
          // TRACK: 
          // MediaStreamTrack { kind: "video", id: "{e5676a77-7099-4b3f-82ea-108a90e7c029}", label: "Integrated_Webcam_HD: Integrate", enabled: true, muted: false, onmute: null, onunmute: null, readyState: "live", onended: null }
          this.peerConnection.addTrack(track, this.localStream);
        });

        this.peerConnection.addEventListener('icecandidate', event => {
          if (!event.candidate) {
            console.log('Got final candidate!');
            return;
          }
          console.log('Got candidate: ', event.candidate);
          firebase.database().ref('/rooms').child(id).child(peerId).child('calleeICE').push().set(event.candidate.toJSON());
        });

        this.peerConnection.addEventListener('track', event => {
          console.log('Got remote track:', event.streams[0]);
          event.streams[0].getTracks().forEach(track => {
            console.log('Add a track to the remoteStream:', track);
            this.remoteStream.addTrack(track);
          });
        });

        this.remoteStream = new MediaStream();
        this.remoteVideoRef.nativeElement.srcObject = this.remoteStream;

        // Code for creating SDP answer below
        this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer)).then(() => {
          const offerOption: RTCOfferOptions = <RTCOfferOptions>{ offerToReceiveAudio: true, offerToReceiveVideo: true };
          this.peerConnection.createAnswer(offerOption).then(answer => {
            console.log('setLocalDescription:', answer);
            this.peerConnection.setLocalDescription(answer);

            const roomWithAnswer = {
              'answer': {
                type: answer.type,
                sdp: answer.sdp,
              }
            };
            firebase.database().ref('/rooms').child(id).child(peerId).update(roomWithAnswer).then(() => {
              console.log(`DB ANSWER. Room ID: <${id}>`);
            });

            // Listening for remote ICE candidates below
            firebase.database().ref('/rooms').child(id).child(peerId).child('callerICE').on("child_added", (snapshot) => {
              console.log('callerICE', snapshot.val());
              this.peerConnection.addIceCandidate(new RTCIceCandidate(snapshot.val()));
            });
            // Listening for remote ICE candidates above

          });
        });
      });
      // Code for creating SDP answer above

      //  });





    });
  }

  hangup(): void {
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
