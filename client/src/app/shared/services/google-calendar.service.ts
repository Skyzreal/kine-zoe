import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class GoogleCalendarService {
  private apiUrl = 'http://localhost:3000';

  constructor(private http: HttpClient) {}

  getAvailability(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/availability`);
  }
}
