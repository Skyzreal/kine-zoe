/// <reference types="gapi" />
/// <reference types="gapi.auth2" />
/// <reference types="gapi.client" />
/// <reference types="gapi.client.calendar" />
import { Injectable } from '@angular/core';
import {gapi, loadGapiInsideDOM} from 'gapi-script';
import { environment } from '../../../environments/environment';


@Injectable({ providedIn: 'root' })
export class GoogleCalendarService {
  private readonly CLIENT_ID = environment.googleClientId;
  private readonly API_KEY = environment.googleApiKey;
  private readonly DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'];
  private readonly SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';

  private gapiSetup = false;
  private authInstance: gapi.auth2.GoogleAuth | undefined;

  async initializeGapiClient(): Promise<void> {
    if (this.gapiSetup) return;

    await loadGapiInsideDOM();
    await new Promise<void>((resolve) => {
      gapi.load('client:auth2', async () => {
        await gapi.client.init({
          apiKey: this.API_KEY,
          clientId: this.CLIENT_ID,
          discoveryDocs: this.DISCOVERY_DOCS,
          scope: this.SCOPES,
        });

        this.authInstance = gapi.auth2.getAuthInstance();
        this.gapiSetup = true;
        resolve();
      });
    });
  }

  async signIn(): Promise<gapi.auth2.GoogleUser> {
    if (!this.authInstance) throw new Error('GAPI not initialized');
    return await this.authInstance.signIn();
  }

  async listFreeEvents(): Promise<any[]> {
    const response = await gapi.client.calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      timeMax: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      showDeleted: false,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.result.items || [];
    return events.filter((e: gapi.client.calendar.Event) =>
    e.summary?.toLowerCase().includes('free'));
  }

  isSignedIn(): boolean {
    return this.authInstance?.isSignedIn.get() ?? false;
  }
}
