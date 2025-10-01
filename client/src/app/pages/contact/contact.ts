import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-contact',
  imports: [FormsModule, CommonModule],
  templateUrl: './contact.html',
  styleUrl: './contact.css'
})
export class Contact {
  name: string = '';
  email: string = '';
  message: string = '';
  isSubmitting: boolean = false;
  submitSuccess: boolean = false;
  submitError: boolean = false;

  constructor(private http: HttpClient) {}

  async onSubmit() {
    if (!this.name || !this.email || !this.message) {
      return;
    }

    this.isSubmitting = true;
    this.submitSuccess = false;
    this.submitError = false;

    try {
      await this.http.post('http://localhost:3000/api/contact', {
        name: this.name,
        email: this.email,
        message: this.message
      }).toPromise();

      this.submitSuccess = true;
      this.name = '';
      this.email = '';
      this.message = '';
    } catch (error) {
      console.error('Error sending email:', error);
      this.submitError = true;
    } finally {
      this.isSubmitting = false;
    }
  }
}
