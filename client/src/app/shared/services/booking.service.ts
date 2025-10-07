import { Injectable } from '@angular/core';

export interface TimeSlot {
  date: string;
  end: string;
  summary: string;
}

export interface ServiceDuration {
  duration: number;
  price: number;
}

@Injectable({
  providedIn: 'root'
})
export class BookingService {
  private selectedSlots: TimeSlot[] = [];
  private selectedService: string = '';
  private selectedDuration: ServiceDuration | null = null;

  setSelectedSlots(slots: TimeSlot[], service: string, duration?: ServiceDuration) {
    this.selectedSlots = slots;
    this.selectedService = service;
    this.selectedDuration = duration || null;
  }

  getSelectedSlots(): TimeSlot[] {
    return this.selectedSlots;
  }

  getSelectedService(): string {
    return this.selectedService;
  }

  getSelectedDuration(): ServiceDuration | null {
    return this.selectedDuration;
  }

  hasSelectedSlots(): boolean {
    return this.selectedSlots.length > 0;
  }

  clearSelection() {
    this.selectedSlots = [];
    this.selectedService = '';
    this.selectedDuration = null;
  }
}