import { Component, OnInit } from '@angular/core';
import {ActivatedRoute, RouterLink} from '@angular/router';
import { GoogleCalendarService } from '../../../shared/services/google-calendar.service';

@Component({
  selector: 'app-reserver',
  standalone: true,
  templateUrl: './reserver.html',
  styleUrl: './reserver.css',
  imports: [
    RouterLink
  ]
})
export class ReserverComponent implements OnInit {
  selectedService: string | null = null;
  freeEvents: any[] = [];

  constructor(
    private route: ActivatedRoute,
    private calendarService: GoogleCalendarService
  ) {}

  async ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      this.selectedService = params.get('service');
    });

    await this.calendarService.initializeGapiClient();

    if (!this.calendarService.isSignedIn()) {
      await this.calendarService.signIn();
    }

    this.freeEvents = await this.calendarService.listFreeEvents();
    console.log('FREE slots:', this.freeEvents);
  }
  async onLoginClick() {
    await this.calendarService.initializeGapiClient();

    if (!this.calendarService.isSignedIn()) {
      await this.calendarService.signIn();
    }

    this.freeEvents = await this.calendarService.listFreeEvents();
  }
}

