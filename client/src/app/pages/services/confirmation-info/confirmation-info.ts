import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { Router } from '@angular/router';
import { StripeService, ClientInfo } from '../../../shared/services/stripe.service';
import { BookingService } from '../../../shared/services/booking.service';

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
  private router = inject(Router);
  private bookingService = inject(BookingService);

  formSubmitted = false;
  isProcessingPayment = false;
  paymentError = '';
  selectedSlots: any[] = [];

  clientInfo: ClientInfo = {
    prenom: '',
    nom: '',
    phone: '',
    email: '',
    service: 'Physiotherapy Session',
    timeSlot: '',
    timeSlotEnd: '',
    amount: 1500
  };

  async ngOnInit() {
    if (this.bookingService.hasSelectedSlots()) {
      this.selectedSlots = this.bookingService.getSelectedSlots();
      this.clientInfo.service = this.bookingService.getSelectedService();
      this.clientInfo.timeSlot = this.selectedSlots[0]?.date || '';
      this.clientInfo.timeSlotEnd = this.selectedSlots[0]?.end || '';

      const duration = this.bookingService.getSelectedDuration();
      if (duration) {
        this.clientInfo.amount = duration.price;
      }
    } else {
      this.router.navigate(['/reserver']);
    }
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
