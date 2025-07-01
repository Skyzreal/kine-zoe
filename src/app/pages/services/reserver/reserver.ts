import { Component } from '@angular/core';
import {ActivatedRoute, RouterLink} from '@angular/router';
@Component({
  selector: 'app-reserver',
  standalone: true,
  imports: [
    RouterLink
  ],
  templateUrl: './reserver.html',
  styleUrl: './reserver.css'
})
export class ReserverComponent {
  selectedService: string | null = null;

  constructor(private route: ActivatedRoute) {
    this.route.queryParamMap.subscribe(params => {
      this.selectedService = params.get('service');
    });
  }
}
