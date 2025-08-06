import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { StripeService, ClientInfo } from '../../../shared/services/stripe.service';

@Component({
  selector: 'app-confirmation-info',
  standalone: true,
  templateUrl: './confirmation-info.html',
  styleUrls: ['./confirmation-info.css'],
  imports: [
    FormsModule, CommonModule, HttpClientModule
  ]
})
export class ConfirmationInfo implements OnInit {
  private stripeService = inject(StripeService);

  formSubmitted = false;
  isProcessingPayment = false;
  paymentError = '';

  clientInfo: ClientInfo = {
    prenom: '',
    nom: '',
    phone: '',
    email: '',
    service: 'Physiotherapy Session', // TODO
    timeSlot: '2024-01-15 10:00', // TODO
    amount: 1500 // TODO: Need to wait for how much the service costs
  };

  async ngOnInit() {
  }

  async submitForm() {
    this.isProcessingPayment = true;
    this.paymentError = '';

    try {
      const session = await this.stripeService.createPaymentSession(this.clientInfo);
      await this.stripeService.redirectToCheckout(session.sessionId);
    } catch (error: any) {
      console.error('Payment error:', error);
      this.paymentError = error.message || 'Failed to process payment';
      this.isProcessingPayment = false;
    }
  }
}
