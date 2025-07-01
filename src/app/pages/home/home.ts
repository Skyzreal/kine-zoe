import {Component, ViewEncapsulation} from '@angular/core';
import {CommonModule, NgOptimizedImage} from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, NgOptimizedImage],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './home.html',
  styleUrls: ['./home.css']
})
export class Home {}
