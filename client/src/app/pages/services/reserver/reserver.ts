import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GoogleCalendarService } from '../../../shared/services/google-calendar.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-reserver',
  standalone: true,
  templateUrl: './reserver.html',
  styleUrl: './reserver.css',
  imports: [RouterLink, CommonModule]
})
export class ReserverComponent implements OnInit {
  selectedService: string | null = null;
  freeEvents: any[] = [];
  loading: boolean = false;
  error: string | null = null;
  selectedSlotIndex: number | null = null;

  constructor(
    private route: ActivatedRoute,
    private calendarService: GoogleCalendarService
  ) {}

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      this.selectedService = params.get('service');
    });

    this.loadAvailability();
  }

  loadAvailability() {
    this.loading = true;
    this.error = null;

    this.calendarService.getAvailability().subscribe({
      next: (data) => {
        this.freeEvents = data;
        this.loading = false;
        console.log('FREE slots:', this.freeEvents);
      },
      error: (err) => {
        this.error = 'Impossible de charger les créneaux disponibles';
        this.loading = false;
        console.error('Error loading availability:', err);
      }
    });
  }

  selectSlot(index: number) {
    this.selectedSlotIndex = index;
  }

  selectTimeSlot() {
    // Handle time slot selection if needed
    console.log('Time slot selected:', this.freeEvents[this.selectedSlotIndex!]);
  }

  // Helper methods for formatting dates and times
  getDateOnly(dateString: string): string {
    const date = new Date(dateString);
    return date.getDate().toString();
  }

  getFullDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  getTimeRange(slot: any): string {
    const start = new Date(slot.date);
    const end = new Date(slot.end);

    const startTime = start.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const endTime = end.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return `${startTime} - ${endTime}`;
  }
}
