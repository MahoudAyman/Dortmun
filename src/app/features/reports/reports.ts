import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import { ExcelService } from '../../shared/excel-export';

@Component({
  selector: 'app-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="space-y-6">
      <!-- Excel Export & JSON Backup Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Multi-Sheet Arabic Excel Export -->
        <div class="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
              <mat-icon>table_view</mat-icon>
            </div>
            <div>
              <h2 class="text-base font-extrabold text-slate-900 dark:text-white">تصدير ملف الإكسل الشامل (SheetJS)</h2>
              <p class="text-xs text-slate-500">يحتوي على 9 أوراق منظمة: ملخص عام، الحضور، السلف، التسويات، المستخلصات، الإضافي، قوائم الناش، الشيكات، والمصاريف مع صفوف الإجماليات.</p>
            </div>
          </div>

          <label class="flex items-center gap-2.5 text-sm cursor-pointer pt-2">
            <input
              type="checkbox"
              [checked]="separateSheetPerProject()"
              (change)="separateSheetPerProject.set($any($event.target).checked)"
              class="w-4 h-4 rounded accent-amber-500"
            />
            <span>إضافة ورقة منفصلة لكل مشروع داخل ملف الإكسل</span>
          </label>

          <div class="pt-2">
            <button
              type="button"
              (click)="excel.exportFullWorkbook({ separateSheetPerProject: separateSheetPerProject() })"
              class="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors"
            >
              <mat-icon>download</mat-icon>
              <span>تنزيل ملف Excel الكامل (.xlsx)</span>
            </button>
          </div>
        </div>

        <!-- JSON Local Backup & Restore -->
        <div class="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
              <mat-icon>cloud_download</mat-icon>
            </div>
            <div>
              <h2 class="text-base font-extrabold text-slate-900 dark:text-white">النسخة الاحتياطية الكاملة (JSON)</h2>
              <p class="text-xs text-slate-500">احفظ نسخة كاملة من قاعدة البيانات المحلية (IndexedDB) لنقلها لأي موبايل أو جهاز آخر بدون إنترنت.</p>
            </div>
          </div>

          <div class="text-xs text-slate-500 pt-1">
            آخر نسخة احتياطية محفوظة: <strong class="text-slate-800 dark:text-slate-200 tabular-nums">{{ store.digits(store.settings().lastBackupDate || 'لم يتم الحفظ بعد') }}</strong>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              (click)="downloadJsonBackup()"
              class="min-h-[48px] rounded-xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-bold text-sm inline-flex items-center justify-center gap-2"
            >
              <mat-icon>save_alt</mat-icon>
              <span>تصدير نسخة JSON</span>
            </button>

            <label class="min-h-[48px] rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer">
              <mat-icon class="text-blue-600">restore</mat-icon>
              <span>استعادة من ملف JSON</span>
              <input type="file" accept=".json" class="hidden" (change)="onRestoreJson($event)" />
            </label>
          </div>
        </div>
      </div>

      <!-- Deployment, PWA Installation & Backup Guide (Section 7 Requirement) -->
      <div class="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
        <h3 class="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
          <mat-icon class="text-amber-500">help_outline</mat-icon>
          <span>دليل التشغيل والنشر والتثبيت على الموبايل والنسخ الاحتياطي</span>
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-1.5">
            <h4 class="font-bold text-sm text-slate-900 dark:text-white">1. تشغيل التطبيق محلياً</h4>
            <p>نفّذ الأمر <code class="font-mono bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">npm install</code> ثم <code class="font-mono bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">npm start</code> ليفتح التطبيق على المنفذ 3000. جميع البيانات تُحفظ تلقائياً داخل متصفحك في IndexedDB عبر Dexie.js.</p>
          </div>

          <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-1.5">
            <h4 class="font-bold text-sm text-slate-900 dark:text-white">2. النشر على Netlify أو GitHub Pages</h4>
            <p>لبناء نسخة الإنتاج نفّذ <code class="font-mono bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">npm run build</code> ثم ارفع مجلد المخرجات <code class="font-mono bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">dist/app/browser</code> إلى Netlify أو GitHub Pages مع توجيه الروابط إلى <code class="font-mono">index.html</code>.</p>
          </div>

          <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-1.5">
            <h4 class="font-bold text-sm text-slate-900 dark:text-white">3. تثبيت التطبيق على الموبايل (PWA)</h4>
            <p>على أندرويد (Chrome): اضغط زر <strong>"تثبيت التطبيق"</strong> في الشريط العلوي أو من قائمة المتصفح اختر "إضافة إلى الشاشة الرئيسية". يعمل التطبيق بالكامل بدون إنترنت.</p>
          </div>

          <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-1.5">
            <h4 class="font-bold text-sm text-slate-900 dark:text-white">4. النسخ الاحتياطي الدوري</h4>
            <p>استخدم زر <strong>"تصدير نسخة JSON"</strong> أو <strong>"تنزيل ملف Excel"</strong> أسبوعياً لحفظ نسخة على هاتفك أو Google Drive/WhatsApp واستعادتها في أي وقت بضغطة واحدة.</p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ReportsPage {
  readonly store = inject(StoreService);
  readonly excel = inject(ExcelService);

  readonly separateSheetPerProject = signal<boolean>(true);

  async downloadJsonBackup(): Promise<void> {
    const json = await this.store.exportJsonBackup();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `دورتمون_نسخة_احتياطية_${this.store.todayIso()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.store.showToast('تم تصدير النسخة الاحتياطية JSON بنجاح', 'success');
  }

  async onRestoreJson(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    await this.store.importJsonBackup(text);
    input.value = '';
  }
}
