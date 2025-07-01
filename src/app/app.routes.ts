import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/home/home').then(m => m.Home),
  },
  {
    path: 'about',
    loadComponent: () =>
      import('./pages/about/about').then(m => m.About),
  },
  {
    path: 'contact',
    loadComponent: () =>
      import('./pages/contact/contact').then(m => m.Contact),
  },
  {
    path: 'reserver',
    loadComponent: () =>
      import('./pages/reserver/reserver').then(m => m.Reserver),
  },
  {
    path: 'calendrier',
    loadComponent: () =>
      import('./pages/calendrier/calendrier').then(m => m.Calendrier),
  }
];
