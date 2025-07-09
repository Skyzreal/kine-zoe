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
    path: 'services',
    loadComponent: () =>
      import('./pages/services/services').then(m => m.Services),
  },
  {
    path: 'reserver',
    loadComponent: () =>
      import('./pages/services/reserver/reserver').then(m => m.ReserverComponent)
  },
  {
    path: 'confirmation-info',
    loadComponent: () =>
      import('./pages/services/confirmation-info/confirmation-info').then(m => m.ConfirmationInfo),
  }

];
