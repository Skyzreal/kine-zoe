import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GoogleCalendarService } from '../../../shared/services/google-calendar.service';
import { CommonModule } from '@angular/common';

interface TimeSlot {
  date: string;
  end: string;
  summary: string;
}

interface DaySlots {
  date: string;
  fullDate: string;
  slots: TimeSlot[];
}

interface CalendarDay {
  date: string;
  dayNumber: number;
  isOtherMonth: boolean;
  hasSlots: boolean;
  slotCount: number;
  daySlots?: DaySlots;
}

@Component({
  selector: 'app-reserver',
  standalone: true,
  templateUrl: './reserver.html',
  styleUrl: './reserver.css',
  imports: [RouterLink, CommonModule]
})
export class ReserverComponent implements OnInit {
  selectedService: string | null = null;
  freeEvents: TimeSlot[] = [];
  groupedSlots: DaySlots[] = [];
  calendarDays: CalendarDay[] = [];
  loading: boolean = false;
  error: string | null = null;
  selectedDay: DaySlots | null = null;
  selectedSlots: TimeSlot[] = [];

  currentDate: Date = new Date();
  currentYear: number = new Date().getFullYear();
  currentMonthName: string = '';

  constructor(
    private route: ActivatedRoute,
    private calendarService: GoogleCalendarService
  ) {
    this.updateCurrentMonthName();
  }

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
        this.groupSlotsByDay();
        this.generateCalendarDays();
        this.loading = false;
        console.log('FREE slots:', this.freeEvents);
        console.log('Grouped slots:', this.groupedSlots);
        console.log('Calendar days:', this.calendarDays);
      },
      error: (err) => {
        this.error = 'Impossible de charger les créneaux disponibles';
        this.loading = false;
        console.error('Error loading availability:', err);
      }
    });
  }

  generateCalendarDays() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startDate = new Date(firstDay);
    startDate.setDate(firstDay.getDate() - firstDay.getDay());

    const endDate = new Date(lastDay);
    endDate.setDate(lastDay.getDate() + (6 - lastDay.getDay()));

    this.calendarDays = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateKey = this.getDateKey(currentDate.toISOString());
      const daySlots = this.groupedSlots.find(slot => this.getDateKey(slot.date) === dateKey);

      this.calendarDays.push({
        date: currentDate.toISOString(),
        dayNumber: currentDate.getDate(),
        isOtherMonth: currentDate.getMonth() !== month,
        hasSlots: !!daySlots,
        slotCount: daySlots ? daySlots.slots.length : 0,
        daySlots: daySlots
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  updateCurrentMonthName() {
    const months = [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    this.currentMonthName = months[this.currentDate.getMonth()];
    this.currentYear = this.currentDate.getFullYear();
  }

  previousMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() - 1);
    this.updateCurrentMonthName();
    this.generateCalendarDays();
  }

  nextMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() + 1);
    this.updateCurrentMonthName();
    this.generateCalendarDays();
  }

  selectCalendarDay(day: CalendarDay) {
    if (day.hasSlots && day.daySlots) {
      this.selectedDay = day.daySlots;
    }
  }

  isDateSelected(date: string): boolean {
    if (!this.selectedDay) return false;
    return this.getDateKey(this.selectedDay.date) === this.getDateKey(date);
  }

  groupSlotsByDay() {
    const grouped = new Map<string, TimeSlot[]>();

    this.freeEvents.forEach(slot => {
      const dateKey = this.getDateKey(slot.date);
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }
      grouped.get(dateKey)!.push(slot);
    });

    this.groupedSlots = Array.from(grouped.entries()).map(([dateKey, slots]) => ({
      date: dateKey,
      fullDate: this.getFullDate(slots[0].date),
      slots: slots.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  selectDay(day: DaySlots) {
    this.selectedDay = day;
  }

  selectTimeSlot(slot: TimeSlot) {
    const isAlreadySelected = this.isSlotSelected(slot);

    if (isAlreadySelected) {
      this.selectedSlots = this.selectedSlots.filter(s =>
        !(s.date === slot.date && s.end === slot.end)
      );
    } else {
      this.selectedSlots.push(slot);
    }

    console.log('Selected slots:', this.selectedSlots);
  }

  isSlotSelected(slot: TimeSlot): boolean {
    return this.selectedSlots.some(s =>
      s.date === slot.date && s.end === slot.end
    );
  }

  removeSelectedSlot(slot: TimeSlot) {
    this.selectedSlots = this.selectedSlots.filter(s =>
      !(s.date === slot.date && s.end === slot.end)
    );
  }

  clearAllSelections() {
    this.selectedSlots = [];
  }

  confirmBooking() {
    if (this.selectedSlots.length > 0) {
      console.log('Booking confirmed for slots:', this.selectedSlots);
    }
  }

  getDateKey(dateString: string): string {
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  }

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

  getDayOfWeek(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { weekday: 'short' });
  }

  getMonthDay(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short'
    });
  }

  getTimeRange(slot: TimeSlot): string {
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

  getSlotCount(day: DaySlots): string {
    const count = day.slots.length;
    return count === 1 ? '1 créneau' : `${count} créneaux`;
  }
}
