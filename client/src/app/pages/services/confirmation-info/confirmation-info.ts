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
  testMode = false;

  clientInfo: ClientInfo = {
    prenom: '',
    nom: '',
    phone: '',
    email: '',
    adresse: '',
    dateNaissance: '',
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
        // Calculate total price based on number of selected slots
        this.clientInfo.amount = duration.price * this.selectedSlots.length;
      }
    } else {
      this.router.navigate(['/reserver']);
    }
  }

  getSinglePrice(): number {
    const duration = this.bookingService.getSelectedDuration();
    return duration ? duration.price : 0;
  }

  getTotalPrice(): number {
    return this.clientInfo.amount ?? 0;
  }

  getFormattedTimeSlot(slot: any): string {
    const start = new Date(slot.date);
    const end = new Date(slot.end);

    const dateStr = start.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const startTime = start.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const endTime = end.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return `${dateStr} - ${startTime} à ${endTime}`;
  }

  async submitForm() {
    this.isProcessingPayment = true;
    this.paymentError = '';

    try {
      // Use 50 cents if test mode is enabled, otherwise use actual amount
      // (Stripe minimum is $0.50 CAD)
      const paymentInfo = {
        ...this.clientInfo,
        amount: this.testMode ? 50 : this.clientInfo.amount
      };

      const session = await this.stripeService.createPaymentSession(paymentInfo);
      await this.stripeService.redirectToCheckout(session.sessionId);
    } catch (error: any) {
      console.error('Payment error:', error);
      this.paymentError = error.message || 'Failed to process payment';
      this.isProcessingPayment = false;
    }
  }
}
