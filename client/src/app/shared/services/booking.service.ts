import { Injectable } from '@angular/core';

export interface TimeSlot {
  date: string;
  end: string;
  summary: string;
}

@Injectable({
  providedIn: 'root'
})
export class BookingService {
  private selectedSlots: TimeSlot[] = [];
  private selectedService: string = '';

  setSelectedSlots(slots: TimeSlot[], service: string) {
    this.selectedSlots = slots;
    this.selectedService = service;
  }

  getSelectedSlots(): TimeSlot[] {
    return this.selectedSlots;
  }

  getSelectedService(): string {
    return this.selectedService;
  }

  hasSelectedSlots(): boolean {
    return this.selectedSlots.length > 0;
  }

  clearSelection() {
    this.selectedSlots = [];
    this.selectedService = '';
  }
}