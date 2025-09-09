import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { EnvironmentService } from './environment.service';

export interface ClientInfo {
  prenom: string;
  nom: string;
  phone: string;
  email: string;
  service?: string;
  timeSlot?: string;
  timeSlotEnd?: string;
  amount?: number;
}

export interface PaymentSession {
  sessionId: string;
  url: string;
}

export interface PaymentVerificationResult {
  success: boolean;
  clientInfo?: {
    name: string;
    email: string;
    phone: string;
    service: string;
    timeSlot: string;
  };
  paymentStatus?: string;
}

@Injectable({
  providedIn: 'root'
})
export class StripeService {
  private http = inject(HttpClient);
  private envService = inject(EnvironmentService);
  private stripe: Stripe | null = null;

  async initializeStripe(): Promise<Stripe | null> {
    if (!this.stripe) {
      this.stripe = await loadStripe(this.envService.stripePublishableKey, {
        locale: 'auto'
      });
    }
    return this.stripe;
  }

  async createPaymentSession(clientInfo: ClientInfo): Promise<PaymentSession> {
    const response = await this.http.post<PaymentSession>(
      `${this.envService.apiBaseUrl}/api/create-payment-session`,
      {
        clientInfo,
        amount: clientInfo.amount || 10000, // Default to $100 CAD
        currency: 'cad',
        service: clientInfo.service,
        timeSlot: clientInfo.timeSlot,
        timeSlotEnd: clientInfo.timeSlotEnd
      }
    ).toPromise();

    if (!response) {
      throw new Error('Failed to create payment session');
    }

    return response;
  }

  async redirectToCheckout(sessionId: string): Promise<void> {
    const stripe = await this.initializeStripe();
    if (!stripe) {
      throw new Error('Stripe failed to initialize');
    }

    const { error } = await stripe.redirectToCheckout({ sessionId });
    if (error) {
      throw error;
    }
  }

  async verifyPayment(sessionId: string): Promise<PaymentVerificationResult> {
    const response = await this.http.get<PaymentVerificationResult>(
      `${this.envService.apiBaseUrl}/api/verify-payment/${sessionId}`
    ).toPromise();

    if (!response) {
      throw new Error('Failed to verify payment');
    }

    return response;
  }
}
