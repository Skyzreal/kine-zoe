import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { StripeService } from '../../../shared/services/stripe.service';

@Component({
  selector: 'app-success',
  imports: [CommonModule],
  templateUrl: './success.html',
  styleUrl: './success.css'
})
export class Success implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private stripeService = inject(StripeService);

  isLoading = true;
  paymentSuccess = false;
  errorMessage = '';
  clientInfo: any = null;
  isFreeBooking = false;

  async ngOnInit() {
    const sessionId = this.route.snapshot.queryParamMap.get('session_id');
    const freeBooking = this.route.snapshot.queryParamMap.get('free');

    // Handle free bookings
    if (freeBooking === 'true') {
      this.isFreeBooking = true;
      this.paymentSuccess = true;
      this.isLoading = false;
      return;
    }

    if (!sessionId) {
      this.errorMessage = 'No session ID provided';
      this.isLoading = false;
      return;
    }

    try {
      const result = await this.stripeService.verifyPayment(sessionId);
      
      if (result.success && result.clientInfo) {
        this.paymentSuccess = true;
        this.clientInfo = result.clientInfo;
        
        // Update calendar and send confirmation email
        await this.finalizeBooking();
      } else {
        this.errorMessage = 'Payment was not successful';
      }
    } catch (error: any) {
      this.errorMessage = error.message || 'Failed to verify payment';
    } finally {
      this.isLoading = false;
    }
  }

  private async finalizeBooking() {
    // Calendar update and email sending are now handled server-side
    // during payment verification for better reliability
  }

  goHome() {
    this.router.navigate(['/']);
  }
}
