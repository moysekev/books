import { Component } from '@angular/core';
import firebase from 'firebase';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'books';

  constructor() {

    const config = {
      apiKey: "AIzaSyDf599V3XGBNF8bPlWKHmYMdQhcDsFx9iQ",
      authDomain: "books-ce78f.firebaseapp.com",
      projectId: "books-ce78f",
      storageBucket: "books-ce78f.appspot.com",
      messagingSenderId: "377647622575",
      appId: "1:377647622575:web:8c2725e555b53edae2a75a",
      measurementId: "G-YEBD2NGZFE"
    };
    firebase.initializeApp(config);

  }
}
