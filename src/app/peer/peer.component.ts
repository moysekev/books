import { Component, OnInit, ViewChild, ElementRef, Input, OnDestroy } from '@angular/core';

import firebase from 'firebase';
import 'firebase/database';

import { RoomComponent } from '../room/room.component';

@Component({
  selector: 'app-peer',
  templateUrl: './peer.component.html',
  styleUrls: ['./peer.component.css']
})
export class PeerComponent implements OnInit, OnDestroy {

  @Input() roomId: string;
  @Input() localPeerId: string;
  @Input() peerId: string;

  @ViewChild("remoteVideo") remoteVideoRef: ElementRef;

  peerConnection: RTCPeerConnection;
  remoteStream: MediaStream = null;

  constructor() { }

  ngOnInit(): void {

    console.log(`PEER ngOnInt ${this.roomId}/${this.localPeerId}/${this.peerId}`);

    this.peerConnection = new RTCPeerConnection(RoomComponent.configuration);
    RoomComponent.registerPeerConnectionListeners(this.peerConnection);

    // Code for collecting ICE candidates below
    this.peerConnection.addEventListener('icecandidate', event => {
      if (!event.candidate) {
        console.log('Got final candidate!');
        return;
      }
      console.log('Got candidate: ', event.candidate);
      firebase.database().ref('/rooms').child(this.roomId).child(this.localPeerId).child(this.peerId).child('callerICE').push().set(event.candidate.toJSON());
    });
    // Code for collecting ICE candidates above

    this.peerConnection.addEventListener('track', event => {
      console.log('Got remote track Event:', this.peerId, event.streams[0]);
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
        this.remoteVideoRef.nativeElement.srcObject = this.remoteStream;
        this.remoteVideoRef.nativeElement.muted = false;
      }
      event.streams[0].getTracks().forEach(track => {
        console.log('Add a track to the remoteStream:', track);
        //this.remoteStream = new MediaStream();
        this.remoteStream.addTrack(track);
      });
    });

    // Code for creating a room below
    const offerOption: RTCOfferOptions = <RTCOfferOptions>{ offerToReceiveAudio: true, offerToReceiveVideo: true };
    this.peerConnection.createOffer(offerOption).then(offer => {
      this.peerConnection.setLocalDescription(offer);
      console.log('Created offer:', offer);

      const db_offer = {
        type: offer.type,
        sdp: offer.sdp,
      };

      firebase.database().ref('/rooms').child(this.roomId).child(this.localPeerId).child(this.peerId).child('offer').set(db_offer).then(() => {
        console.log(`New OFFER in Room<${this.roomId}> for Peer<${this.peerId}>`);
      });

      // Listening for remote session description below
      var ref = firebase.database().ref(`/rooms/${this.roomId}/${this.localPeerId}/${this.peerId}/answer`);
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
      firebase.database().ref('/rooms').child(this.roomId).child(this.peerId).child(this.localPeerId).child('calleeICE').on("child_added", (snapshot) => {
        console.log('calleeICE', snapshot.val());
        this.peerConnection.addIceCandidate(new RTCIceCandidate(snapshot.val()));
      });
      // Listening for remote ICE candidates above
    });
    // Code for creating a room above
  }

  ngOnDestroy(): void {

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => {
        track.stop();
      });
    }
    this.remoteVideoRef.nativeElement.srcObject = null;

    this.peerConnection.close();
  }
}
