import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class EnvironmentService {
  // Production configuration - update Stripe key when ready for live payments
  readonly STRIPE_PUBLISHABLE_KEY = 'pk_test_51RnR4cFg8bVJVRSPrhgdSbnlsy2lz0mowntP1fB5HfjCP4Ce5yUEQaRnFxzdjQ9FO90CtEYeu8myZZ8xPSryJp5E00AbRotQ3n'
  readonly API_BASE_URL = 'https://kine-zoe-api.vercel.app';

  get stripePublishableKey(): string {
    return this.STRIPE_PUBLISHABLE_KEY;
  }

  get apiBaseUrl(): string {
    return this.API_BASE_URL;
  }
}
