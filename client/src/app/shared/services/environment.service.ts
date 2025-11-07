import { Injectable } from '@angular/core';
import { environment } from './environment.config';

@Injectable({
  providedIn: 'root'
})
export class EnvironmentService {
  get stripePublishableKey(): string {
    return environment.stripePublishableKey;
  }

  get apiBaseUrl(): string {
    return environment.apiBaseUrl;
  }
}
