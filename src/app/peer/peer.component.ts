import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, Input, OnDestroy, HostListener } from '@angular/core';

import firebase from 'firebase';
import 'firebase/database';

import { RoomComponent } from '../room/room.component';

@Component({
  selector: 'app-peer',
  templateUrl: './peer.component.html',
  styleUrls: ['./peer.component.css']
})
export class PeerComponent implements OnInit, AfterViewInit, OnDestroy {

  @Input() roomId: string;
  @Input() localPeerId: string;
  @Input() peerId: string;

  name: string = null;

  @ViewChild("remoteVideo") remoteVideoRef: ElementRef;

  peerConnection: RTCPeerConnection;
  remoteStream: MediaStream = new MediaStream();

  constructor() { }

  @HostListener('window:unload', ['$event'])
  unloadHandler(event: any) {
    //console.log("unloadHandler");
    this.doCleanup();
  }

  // Use BEFORE unload to hangup (works for Firefox at least)
  // This is usefull if user closes the tab, or refreshes the page
  @HostListener('window:beforeunload', ['$event'])
  beforeUnloadHandler(event: any) {
    //console.log("beforeUnloadHandler");
    this.doCleanup();
  }

  private onName: any;
  private onAnswer: any;
  private onCalleeICE: any;

  ngOnInit(): void {

    console.log(`Peer<${this.peerId}> : ngOnInt ${this.roomId}/${this.localPeerId}/${this.peerId}`);

    this.peerConnection = new RTCPeerConnection(RoomComponent.configuration);
    RoomComponent.registerPeerConnectionListeners(this.peerConnection, this.peerId);

    // listen to name change

    this.onName = (snapshot: any) => {
      this.name = snapshot.val();
    }
    firebase.database().ref(`/rooms/${this.roomId}/${this.peerId}`).child('name').on("value", this.onName);

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
      event.streams[0].getTracks().forEach(track => {
        // Note seems to be called twice more as necessary (4 instead of 2)
        // but getTracks().length display shows 1, 2, 2, 2 which indicates
        // that a same track is not duplicated.
        console.log('Add a track to the remoteStream:', track);
        this.remoteStream.addTrack(track);
        console.log(`Peer<${this.peerId}> number of tracks : ${this.remoteStream.getTracks().length}`);
      });
    });

    // Code for creating a room below
    const offerOption: RTCOfferOptions = <RTCOfferOptions>{ offerToReceiveAudio: true, offerToReceiveVideo: true };
    this.peerConnection.createOffer(offerOption).then(offer => {
      this.peerConnection.setLocalDescription(offer).then().catch((error) => {
        console.error("setLocalDescription(offer) CAUGHT : " + error);
      });
      console.log('Created offer:', offer);

      const db_offer = {
        type: offer.type,
        sdp: offer.sdp,
      };

      firebase.database().ref('/rooms').child(this.roomId).child(this.localPeerId).child(this.peerId).child('offer').set(db_offer).then(() => {
        console.log(`New OFFER in Room<${this.roomId}> from LocalPeer<${this.localPeerId}> to Peer<${this.peerId}>`);
      }).catch((error) => {
        console.error("CAUGHT" + error);
      });

      // Listening for remote session description below
      this.onAnswer = (snapshot: any) => {
        const answer = snapshot.val();
        if (answer == null) return;
        console.log('Got remote description: ', answer);
        if (!this.peerConnection.currentRemoteDescription) {
          this.peerConnection.setRemoteDescription(answer).then(() => {
            console.log('setRemoteDescription DONE ', answer);
          }).catch((error) => {
            console.error("CAUGHT" + error);
          });
        }
      };
      firebase.database().ref(`/rooms/${this.roomId}/${this.localPeerId}/${this.peerId}/answer`).on("value", this.onAnswer, (errorObject) => {
        console.log("The read failed: " + errorObject.code);
      });
      // Listening for remote session description above

      // Listening for remote ICE candidates below
      this.onCalleeICE = (snapshot: any) => {
        console.log('calleeICE', snapshot.val());
        this.peerConnection.addIceCandidate(new RTCIceCandidate(snapshot.val()));
      };
      firebase.database().ref('/rooms').child(this.roomId).child(this.peerId).child(this.localPeerId).child('calleeICE').on("child_added", this.onCalleeICE);
      // Listening for remote ICE candidates above
    }).catch((error) => {
      console.error("CAUGHT" + error);
    });
    // Code for creating a room above
  }

  ngAfterViewInit() {
    // remote stream is attached to DOM during ngAfterViewInit because @ViewChild is not bound before this stage
    this.remoteVideoRef.nativeElement.srcObject = this.remoteStream;
    this.remoteVideoRef.nativeElement.muted = false;
  }

  ngOnDestroy(): void {
    this.doCleanup();
  }

  private doCleanup() {
    console.log(`doCleanup Peer<${this.peerId}> from LocalPeer<${this.localPeerId}>`);

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => {
        track.stop();
      });
    }
    this.remoteVideoRef.nativeElement.srcObject = null;

    if (this.onName) {
      firebase.database().ref(`/rooms/${this.roomId}/${this.peerId}`).child('name').off("value", this.onName);
    }
    if (this.onAnswer) {
      firebase.database().ref(`/rooms/${this.roomId}/${this.localPeerId}/${this.peerId}/answer`).off("value", this.onAnswer);
    }
    if (this.onCalleeICE) {
      firebase.database().ref('/rooms').child(this.roomId).child(this.peerId).child(this.localPeerId).child('calleeICE').off("child_added", this.onCalleeICE);
    }
    firebase.database().ref('/rooms').child(this.roomId).child(this.localPeerId).child(this.peerId).remove();

    this.peerConnection.close();
    this.peerConnection = null;
  }
}
