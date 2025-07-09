import { Component } from '@angular/core';
import {FormsModule} from '@angular/forms';
import { CommonModule } from '@angular/common';
@Component({
  selector: 'app-confirmation-info',
  standalone: true,
  templateUrl: './confirmation-info.html',
  styleUrls: ['./confirmation-info.css'],
  imports: [
    FormsModule, CommonModule
  ]
})
export class ConfirmationInfo {
  formSubmitted = false;

  submitForm() {
    this.formSubmitted = true;
    // TODO: Paiement se ferait ici également, après que l'option de payer soit là
    // LOOK INTO Stripe: https://docs.stripe.com/checkout/quickstart
    // TODO: quand le form est soumit, trigger envoyer un courriel et confirmation
    // LOOK INTO: EmailJS: https://www.emailjs.com/
  }
}
