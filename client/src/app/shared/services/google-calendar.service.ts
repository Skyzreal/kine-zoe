import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EnvironmentService } from './environment.service';

@Injectable({
  providedIn: 'root'
})
export class GoogleCalendarService {
  private apiUrl: string;

  constructor(private http: HttpClient, private env: EnvironmentService) {
    this.apiUrl = this.env.apiBaseUrl;
  }

  getAvailability(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/availability`);
  }
}
