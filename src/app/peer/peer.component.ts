import { Component, OnInit, ViewChild, ElementRef, Input } from '@angular/core';

import firebase from 'firebase';
import 'firebase/database';

import {RoomComponent} from '../room/room.component';

@Component({
  selector: 'app-peer',
  templateUrl: './peer.component.html',
  styleUrls: ['./peer.component.css']
})
export class PeerComponent implements OnInit {

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

  @Input() roomId: string;
  @Input() peerId: string;
  @Input() localStream: MediaStream;

  peerConnection: RTCPeerConnection;
  remoteStream: MediaStream = null;

  @ViewChild("remoteVideo") remoteVideoRef: ElementRef;

  constructor() { }

  ngOnInit(): void {

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

    // Code for collecting ICE candidates below
    this.peerConnection.addEventListener('icecandidate', event => {
      if (!event.candidate) {
        console.log('Got final candidate!');
        return;
      }
      console.log('Got candidate: ', event.candidate);
      //callerCandidatesCollection.add(event.candidate.toJSON());
      //firebase.database().ref('/callerCandidates').set(event.candidate.toJSON());
      firebase.database().ref('/rooms').child(this.roomId).child(this.peerId).child('callerICE').push().set(event.candidate.toJSON());
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
        //'offer': {
        type: offer.type,
        sdp: offer.sdp,
        //}
      };

      firebase.database().ref('/rooms').child(this.roomId).child(this.peerId).child('offer').set(roomWithOffer).then(() => {
        console.log(`New OFFER in Room<${this.roomId}> for Peer<${this.peerId}>`);
      });

      // Listening for remote session description below
      var ref = firebase.database().ref(`/rooms/${this.roomId}/${this.peerId}/answer`);
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
      firebase.database().ref('/rooms').child(this.roomId).child(this.peerId).child('calleeICE').on("child_added", (snapshot) => {
        console.log('calleeICE', snapshot.val());
        this.peerConnection.addIceCandidate(new RTCIceCandidate(snapshot.val()));
      });
      // Listening for remote ICE candidates above
    });
    // Code for creating a room above

  }

}
