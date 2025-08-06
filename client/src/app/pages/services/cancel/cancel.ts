import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-cancel',
  imports: [],
  templateUrl: './cancel.html',
  styleUrl: './cancel.css'
})
export class Cancel {
  private router = inject(Router);

  goHome() {
    this.router.navigate(['/']);
  }

  tryAgain() {
    this.router.navigate(['/confirmation-info']);
  }
}