import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard').then((m) => m.DashboardPage),
  },
  {
    path: 'workers',
    loadComponent: () =>
      import('./features/workers/workers').then((m) => m.WorkersPage),
  },
  {
    path: 'attendance',
    loadComponent: () =>
      import('./features/attendance/attendance').then((m) => m.AttendancePage),
  },
  {
    path: 'bulk',
    loadComponent: () =>
      import('./features/bulk/bulk').then((m) => m.BulkEntryPage),
  },
  {
    path: 'advances',
    loadComponent: () =>
      import('./features/advances/advances').then((m) => m.AdvancesPage),
  },
  {
    path: 'deductions',
    loadComponent: () =>
      import('./features/deductions/deductions').then((m) => m.DeductionsPage),
  },
  {
    path: 'settlements',
    loadComponent: () =>
      import('./features/settlements/settlements').then(
        (m) => m.SettlementsPage
      ),
  },
  {
    path: 'extracts',
    loadComponent: () =>
      import('./features/extracts/extracts').then((m) => m.ExtractsPage),
  },
  {
    path: 'extras',
    loadComponent: () =>
      import('./features/extras/extras').then((m) => m.ExtrasPage),
  },
  {
    path: 'checks',
    loadComponent: () =>
      import('./features/checks/checks').then((m) => m.ChecksPage),
  },
  {
    path: 'expenses',
    loadComponent: () =>
      import('./features/expenses/expenses').then((m) => m.ExpensesPage),
  },
  {
    path: 'reports',
    loadComponent: () =>
      import('./features/reports/reports').then((m) => m.ReportsPage),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings').then((m) => m.SettingsPage),
  },
  {
    path: 'zaki',
    loadComponent: () =>
      import('./features/zaki/zaki').then((m) => m.ZakiPage),
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
