import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GoogleCalendarService } from '../../../shared/services/google-calendar.service';
import { BookingService, ServiceDuration } from '../../../shared/services/booking.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

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
  imports: [CommonModule, FormsModule]
})
export class ReserverComponent implements OnInit {
  selectedService: string | null = null;
  serviceInfo: {title: string, description: string, icon: string, color: string, price?: number, duration?: number, isFree?: boolean} | null = null;
  freeEvents: TimeSlot[] = [];
  groupedSlots: DaySlots[] = [];
  calendarDays: CalendarDay[] = [];
  loading: boolean = false;
  error: string | null = null;
  selectedDay: DaySlots | null = null;
  selectedSlots: TimeSlot[] = [];

  selectedDuration: number = 60;
  massageDurations = [
    { duration: 45, price: 7500, label: '45 minutes - 75$' },
    { duration: 60, price: 11000, label: '60 minutes - 110$' },
    { duration: 75, price: 12000, label: '75 minutes - 120$' },
    { duration: 90, price: 14000, label: '90 minutes - 140$' }
  ];

  currentDate: Date = new Date();
  currentYear: number = new Date().getFullYear();
  currentMonthName: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private calendarService: GoogleCalendarService,
    private bookingService: BookingService
  ) {
    this.updateCurrentMonthName();
  }

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      this.selectedService = params.get('service');
      this.setServiceInfo();
    });

    this.loadAvailability();
  }

  setServiceInfo() {
    const serviceInfoMap: {[key: string]: {title: string, description: string, icon: string, color: string, price?: number, duration?: number, isFree?: boolean}} = {
      'Remise en forme': {
        title: 'Remise en forme',
        description: 'Programme d\'entraînement structuré visant à améliorer la condition physique, la posture et la performance globale.',
        icon: '🏋️',
        color: 'pastel-blue',
        price: 15000,
        duration: 30
      },
      'Prévention et gestion des blessures': {
        title: 'Prévention et gestion des blessures',
        description: 'Processus de rééducation individualisé pour restaurer la mobilité, la force et la fonction après une blessure et prévenir les récidives.',
        icon: '🔄',
        color: 'pastel-yellow',
        price: 15000,
        duration: 30
      },
      'Coaching - course à pied / triathlon': {
        title: 'Coaching - course à pied / triathlon',
        description: 'Accompagnement personnalisé en course à pied et triathlon pour optimiser la performance, la technique et la prévention des blessures.',
        icon: '🏃',
        color: 'pastel-orange',
        price: 0,
        duration: 30,
        isFree: true
      },
      'Massage': {
        title: 'Massage thérapeutique',
        description: 'Thérapie manuelle adaptée aux besoins musculaires pour réduire les tensions, favoriser la circulation et optimiser la récupération.',
        icon: '🤲',
        color: 'pastel-mint'
      }
    };

    this.serviceInfo = this.selectedService ? serviceInfoMap[this.selectedService] || null : null;
  }

  isMassageService(): boolean {
    return this.selectedService === 'Massage';
  }

  isFreeService(): boolean {
    return this.serviceInfo?.isFree === true;
  }

  getSelectedPrice(): number {
    if (this.isMassageService()) {
      const selected = this.massageDurations.find(d => d.duration === this.selectedDuration);
      return selected ? selected.price : 11000;
    }
    // Return 0 for free services, otherwise return the service price
    if (this.isFreeService()) {
      return 0;
    }
    return this.serviceInfo?.price || 0;
  }

  getTotalPrice(): number {
    return this.getSelectedPrice() * this.selectedSlots.length;
  }

  getFormattedTotalPrice(): string {
    const total = this.getTotalPrice() / 100;
    return `${total}$`;
  }

  getFormattedSinglePrice(): string {
    const price = this.getSelectedPrice() / 100;
    return `${price}$`;
  }

  canSelectMoreSlots(): boolean {
    // Free services can only book 1 slot
    if (this.isFreeService()) {
      return this.selectedSlots.length < 1;
    }
    return true;
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
      },
      error: (err) => {
        this.error = 'Impossible de charger les créneaux disponibles';
        this.loading = false;
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
    const now = new Date();
    const oneMonthFromNow = new Date();
    oneMonthFromNow.setMonth(now.getMonth() + 1);
    
    // Don't allow navigation beyond one month from current date
    if (this.currentDate.getMonth() < oneMonthFromNow.getMonth() || this.currentDate.getFullYear() < oneMonthFromNow.getFullYear()) {
      this.currentDate.setMonth(this.currentDate.getMonth() + 1);
      this.updateCurrentMonthName();
      this.generateCalendarDays();
    }
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
        !(s.date === slot.date)
      );
    } else {
      if (this.canSelectMoreSlots()) {
        if (this.hasEnoughDuration(slot)) {
          // Calculate the correct end time based on selected duration
          const appointmentDuration = this.isMassageService()
            ? this.selectedDuration
            : (this.serviceInfo?.duration || 30);

          const startTime = new Date(slot.date);
          const endTime = new Date(startTime);
          endTime.setMinutes(endTime.getMinutes() + appointmentDuration);

          // Create a new slot with the correct end time
          const bookingSlot: TimeSlot = {
            date: slot.date,
            end: endTime.toISOString(),
            summary: slot.summary
          };

          this.selectedSlots.push(bookingSlot);
        }
      }
    }
  }

  hasEnoughDuration(slot: TimeSlot): boolean {
    const slotStart = new Date(slot.date);
    const slotEnd = new Date(slot.end);
    const slotDurationMinutes = (slotEnd.getTime() - slotStart.getTime()) / (1000 * 60);

    const requiredDuration = this.isMassageService()
      ? this.selectedDuration + 15
      : (this.serviceInfo?.duration || 30) + 15;

    return slotDurationMinutes >= requiredDuration;
  }

  getSlotDuration(slot: TimeSlot): number {
    const slotStart = new Date(slot.date);
    const slotEnd = new Date(slot.end);
    return (slotEnd.getTime() - slotStart.getTime()) / (1000 * 60);
  }

  isSlotTooShort(slot: TimeSlot): boolean {
    return !this.hasEnoughDuration(slot);
  }

  isSlotSelected(slot: TimeSlot): boolean {
    return this.selectedSlots.some(s =>
      s.date === slot.date
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
      const duration: ServiceDuration = {
        duration: this.isMassageService() ? this.selectedDuration : (this.serviceInfo?.duration || 30),
        price: this.getSelectedPrice()
      };

      this.bookingService.setSelectedSlots(
        this.selectedSlots,
        this.selectedService || 'Physiotherapy Session',
        duration
      );
      this.router.navigate(['/confirmer']);
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

    // Calculate the actual appointment end time based on selected duration
    const appointmentDuration = this.isMassageService()
      ? this.selectedDuration
      : (this.serviceInfo?.duration || 30);

    const appointmentEnd = new Date(start);
    appointmentEnd.setMinutes(appointmentEnd.getMinutes() + appointmentDuration);

    const startTime = start.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const endTime = appointmentEnd.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return `${startTime} - ${endTime}`;
  }

  getSlotCount(day: DaySlots): string {
    const count = day.slots.length;
    return count === 1 ? '1 créneau' : `${count} créneaux`;
  }

  canNavigateToNextMonth(): boolean {
    const now = new Date();
    const oneMonthFromNow = new Date();
    oneMonthFromNow.setMonth(now.getMonth() + 1);
    
    return (this.currentDate.getMonth() < oneMonthFromNow.getMonth() || this.currentDate.getFullYear() < oneMonthFromNow.getFullYear());
  }
}
