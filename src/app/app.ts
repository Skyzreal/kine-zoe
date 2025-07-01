import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from './shared/navbar/navbar';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, NavbarComponent],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App {}
