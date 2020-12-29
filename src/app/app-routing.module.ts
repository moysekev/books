import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SignupComponent } from './auth/signup/signup.component';
import { SigninComponent } from './auth/signin/signin.component';
import { BookListComponent } from './book-list/book-list.component';
import { SingleBookComponent } from './book-list/single-book/single-book.component';
import { BookFormComponent } from './book-list/book-form/book-form.component';
import { RoomComponent } from './room/room.component';

import { AuthGuardService } from './services/auth-guard.service';


const routes: Routes = [
  { path: 'auth/signup', component: SignupComponent },
  { path: 'auth/signin', component: SigninComponent },
  { path: 'books', canActivate: [AuthGuardService], component: BookListComponent },
  { path: 'books/new', canActivate: [AuthGuardService], component: BookFormComponent },
  { path: 'books/view/:id', canActivate: [AuthGuardService], component: SingleBookComponent },
  { path: 'room/:id', component: RoomComponent },
  { path: '', redirectTo: 'room/' + RoomComponent.uuidv4(), pathMatch: 'full' },
  { path: '**', redirectTo: 'room/' + RoomComponent.uuidv4() }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
