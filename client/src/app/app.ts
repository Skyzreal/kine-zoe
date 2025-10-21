import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from './shared/navbar/navbar';
import { Footer } from './shared/footer/footer';
import { provideHttpClient } from '@angular/common/http';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, NavbarComponent, Footer],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App {}
