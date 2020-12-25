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

  db = firebase.firestore();

  id: string = null;

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

  capture(): void {

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

      this.peerConnection = new RTCPeerConnection(this.configuration);
      this.registerPeerConnectionListeners();

      this.localStream.getTracks().forEach(track => {
        //console.log('TRACK:', track);
        // TRACK: 
        // MediaStreamTrack { kind: "audio", id: "{498af056-db75-47de-881b-297ea612f622}", label: "Audio interne Stéréo analogique", enabled: true, muted: false, onmute: null, onunmute: null, readyState: "live", onended: null }
        // TRACK: 
        // MediaStreamTrack { kind: "video", id: "{e5676a77-7099-4b3f-82ea-108a90e7c029}", label: "Integrated_Webcam_HD: Integrate", enabled: true, muted: false, onmute: null, onunmute: null, readyState: "live", onended: null }
        this.peerConnection.addTrack(track, this.localStream);
      });

      // Code for collecting ICE candidates below
      this.peerConnection.addEventListener('icecandidate', event => {
        if (!event.candidate) {
          console.log('Got final candidate!');
          return;
        }
        console.log('Got candidate: ', event.candidate);
        //callerCandidatesCollection.add(event.candidate.toJSON());
        //firebase.database().ref('/callerCandidates').set(event.candidate.toJSON());
        firebase.database().ref('/rooms').child(this.id).child('callerICE').push().set(event.candidate.toJSON());
      });
      // Code for collecting ICE candidates above

      this.peerConnection.addEventListener('track', event => {
        console.log('Got remote track:', event.streams[0]);
        event.streams[0].getTracks().forEach(track => {
          console.log('Add a track to the remoteStream:', track);
          this.remoteStream = new MediaStream();
          this.remoteStream.addTrack(track);
          this.remoteVideoRef.nativeElement.srcObject = this.remoteStream;
        });
      });

      // Code for creating a room below
      const offerOption: RTCOfferOptions = <RTCOfferOptions>{ offerToReceiveAudio: true, offerToReceiveVideo: true };
      this.peerConnection.createOffer(offerOption).then(offer => {
        this.peerConnection.setLocalDescription(offer);
        console.log('Created offer:', offer);

        const roomWithOffer = {
          'offer': {
            type: offer.type,
            sdp: offer.sdp,
          }
        };
        //const id = this.uuidv4();
        this.id = 'TEST';
        const id = this.id;
        firebase.database().ref('/rooms').child(id).set(roomWithOffer).then(() => {
          console.log(`New room created with SDP offer. Room ID: <${id}>`);
        });

        // Listening for remote session description below
        var ref = firebase.database().ref(`/rooms/${id}/answer`);
        // Attach an asynchronous callback to read the data at our posts reference
        ref.on("value", (snapshot) => {
          const answer = snapshot.val();
          if (answer == null) return;
          console.log('Got remote description: ', answer);
          if (!this.peerConnection.currentRemoteDescription) {
            const rtcSessionDescription = new RTCSessionDescription(answer);
            this.peerConnection.setRemoteDescription(rtcSessionDescription).then(() => {
              console.log('setRemoteDescription DONE ', answer);
            });
          }
          
        }, (errorObject) => {
          console.log("The read failed: " + errorObject.code);
        });
        // Listening for remote session description above

        // Listening for remote ICE candidates below
        firebase.database().ref('/rooms').child(id).child('calleeICE').on("child_added", (snapshot) => {
          console.log('calleeICE', snapshot.val());
          this.peerConnection.addIceCandidate(new RTCIceCandidate(snapshot.val()));
        });
        // Listening for remote ICE candidates above

      });
      // Code for creating a room above
    });
  }

  join(): void {

    navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    }).then(stream => {
      this.localStream = stream;
      this.localVideoRef.nativeElement.autoplay = true;
      this.localVideoRef.nativeElement.muted = false;
      // Attach stream
      this.localVideoRef.nativeElement.srcObject = stream;
      const id = 'TEST';
      console.log(`/rooms/${id}/answer`);

      this.peerConnection = new RTCPeerConnection(this.configuration);
      this.registerPeerConnectionListeners();

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
        firebase.database().ref('/rooms').child(id).child('calleeICE').push().set(event.candidate.toJSON());
      });

      this.peerConnection.addEventListener('track', event => {
        console.log('Got remote track:', event.streams[0]);
        event.streams[0].getTracks().forEach(track => {
          console.log('Add a track to the remoteStream:', track);
          this.remoteStream.addTrack(track);
        });
      });

      // this.capture().then(stream => {
      //   this.localStream = stream;

      //   this.localVideoRef.nativeElement.autoplay = true;
      //   this.localVideoRef.nativeElement.muted = false;
      //   // Attach stream
      //   this.localVideoRef.nativeElement.srcObject = stream;

      // });

      this.remoteStream = new MediaStream();
      this.remoteVideoRef.nativeElement.srcObject = this.remoteStream;

      // Code for creating SDP answer below
      firebase.database().ref(`/rooms/${id}/offer`).once("value", (snapshot) => {
        const offer = snapshot.val();
        if (offer == null) {
          console.log("OFFER : NULL");
          return;
        }
        console.log("OFFER : ", offer);

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
            firebase.database().ref('/rooms').child(id).update(roomWithAnswer).then(() => {
              console.log(`DB ANSWER. Room ID: <${id}>`);
            });

            // Listening for remote ICE candidates below
            firebase.database().ref('/rooms').child(id).child('callerICE').on("child_added", (snapshot) => {
              console.log('callerICE', snapshot.val());
              this.peerConnection.addIceCandidate(new RTCIceCandidate(snapshot.val()));
            });
            // Listening for remote ICE candidates above

          });
        });
      });
      // Code for creating SDP answer above


      // roomRef.collection('callerCandidates').onSnapshot(snapshot => {
      //   snapshot.docChanges().forEach(async change => {
      //     if (change.type === 'added') {
      //       let data = change.doc.data();
      //       console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
      //       await peerConnection.addIceCandidate(new RTCIceCandidate(data));
      //     }
      //   });
      // });

    });
  }

  hangup(): void {
  }


  registerPeerConnectionListeners() {
    this.peerConnection.addEventListener('icegatheringstatechange', () => {
      console.log(
        `ICE gathering state changed: ${this.peerConnection.iceGatheringState}`);
    });

    this.peerConnection.addEventListener('connectionstatechange', () => {
      console.log(`Connection state change: ${this.peerConnection.connectionState}`);
    });

    this.peerConnection.addEventListener('signalingstatechange', () => {
      console.log(`Signaling state change: ${this.peerConnection.signalingState}`);
    });

    this.peerConnection.addEventListener('iceconnectionstatechange ', () => {
      console.log(
        `ICE connection state change: ${this.peerConnection.iceConnectionState}`);
    });
  }

}
