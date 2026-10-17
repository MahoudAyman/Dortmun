import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <div class="space-y-6">
      <!-- General & Cap Rules Settings -->
      <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
        <h2 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <mat-icon class="text-amber-500">tune</mat-icon>
          <span>إعدادات الشركة والحد الشهري والأسعار الافتراضية</span>
        </h2>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label for="set-company" class="block text-xs font-medium mb-1">اسم الشركة</label>
            <input
              id="set-company"
              type="text"
              [value]="store.settings().companyName"
              (change)="store.updateSettings({ companyName: $any($event.target).value })"
              class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
            />
          </div>

          <div>
            <label for="set-cap" class="block text-xs font-medium mb-1">الحد الأقصى الشهري للعامل (يومية)</label>
            <input
              id="set-cap"
              type="number"
              [value]="store.settings().monthlyDayCap"
              (change)="store.updateSettings({ monthlyDayCap: +$any($event.target).value })"
              class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums"
            />
          </div>

          <div>
            <label for="set-expected" class="block text-xs font-medium mb-1">الأيام المتوقعة شهرياً (لتنبيه النقص)</label>
            <input
              id="set-expected"
              type="number"
              [value]="store.settings().expectedMonthlyDays"
              (change)="store.updateSettings({ expectedMonthlyDays: +$any($event.target).value })"
              class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums"
            />
          </div>

          <div>
            <label for="set-capmode" class="block text-xs font-medium mb-1">سلوك تجاوز الحد الشهري</label>
            <select
              id="set-capmode"
              [value]="store.settings().capMode"
              (change)="store.updateSettings({ capMode: $any($event.target).value })"
              class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
            >
              <option value="confirm">تحذير "اعمل حسابك" مع طلب تأكيد</option>
              <option value="block">منع الإضافة نهائياً بعد الحد</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          <div>
            <label for="set-numeral" class="block text-xs font-medium mb-1">تنسيق الأرقام</label>
            <select
              id="set-numeral"
              [value]="store.settings().numeralMode"
              (change)="store.updateSettings({ numeralMode: $any($event.target).value })"
              class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              <option value="ar">أرقام عربية (١٢٣٤٥)</option>
              <option value="en">أرقام إنجليزية (12345)</option>
            </select>
          </div>

          <div>
            <label for="set-def-proj" class="block text-xs font-medium mb-1">المشروع الافتراضي</label>
            <select
              id="set-def-proj"
              [value]="store.settings().defaultProjectId ?? ''"
              (change)="onDefaultProjectChange($event)"
              class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              <option value="">كل المشاريع (بدون فلتر افتراضي)</option>
              @for (p of store.projects(); track p.id) {
                <option [value]="p.id">{{ p.name }}</option>
              }
            </select>
          </div>

          <div>
            <label for="set-pin" class="block text-xs font-medium mb-1">رمز قفل التطبيق (PIN اختياري)</label>
            <div class="flex gap-2">
              <input
                id="set-pin"
                type="password"
                maxlength="6"
                [value]="pinInput()"
                (input)="pinInput.set($any($event.target).value)"
                placeholder="مثال: 1234"
                class="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums"
              />
              <button
                type="button"
                (click)="savePin()"
                class="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold"
              >
                {{ store.settings().pinHash ? 'تحديث / إلغاء' : 'تفعيل القفل' }}
              </button>
            </div>
          </div>

          <div>
            <label for="set-lock-month" class="block text-xs font-medium mb-1">أرشفة وقفل شهر ضد التعديل</label>
            <div class="flex gap-2">
              <input
                id="set-lock-month"
                type="month"
                [value]="monthToToggle()"
                (change)="monthToToggle.set($any($event.target).value)"
                class="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs tabular-nums"
              />
              <button
                type="button"
                (click)="toggleArchiveMonth()"
                class="px-3 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold whitespace-nowrap"
              >
                {{ store.isMonthLocked(monthToToggle()) ? 'فك القفل' : 'قفل الشهر' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Projects & Tax Rates & Engineers Management -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Projects Management -->
        <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 class="text-sm font-bold text-slate-900 dark:text-white">المشاريع وأسعار الشركة</h3>
          <div class="space-y-2 text-xs">
            @for (proj of store.projects(); track proj.id) {
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                <div>
                  <div class="font-bold text-sm text-slate-900 dark:text-white">{{ proj.name }}</div>
                  <div class="text-slate-500">يومية الشركة: {{ store.money(proj.companyDayRate) }} · سهرة: {{ store.money(proj.companyNightRate) }}</div>
                </div>
              </div>
            }
          </div>

          <form [formGroup]="projectForm" (ngSubmit)="addProject()" class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <input type="text" formControlName="name" placeholder="اسم المشروع الجديد..." aria-label="اسم المشروع الجديد" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs" />
            <div class="grid grid-cols-2 gap-2">
              <input type="number" formControlName="companyDayRate" placeholder="يومية الشركة" aria-label="سعر يومية الشركة" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs tabular-nums" />
              <input type="number" formControlName="companyNightRate" placeholder="سهرة الشركة" aria-label="سعر سهرة الشركة" class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs tabular-nums" />
            </div>
            <button type="submit" [disabled]="projectForm.invalid" class="w-full py-2 rounded-xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-bold text-xs">
              إضافة مشروع
            </button>
          </form>
        </div>

        <!-- Tax Rates Management -->
        <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 class="text-sm font-bold text-slate-900 dark:text-white">نسب الضرائب للمستخلصات</h3>
          <p class="text-xs text-slate-500">تعديل النسبة يحدّث كل أسطر المستخلصات المفتوحة تلقائياً، والأسطر المحفوظة تحتفظ بنسبتها.</p>

          <div class="space-y-2 text-xs">
            @for (tr of store.settings().taxRates; track $index; let idx = $index) {
              <div class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <span class="font-bold">{{ tr.name }}</span>
                <div class="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.5"
                    [value]="tr.rate"
                    (change)="updateTaxRateValue(idx, +$any($event.target).value)"
                    [attr.aria-label]="'نسبة ' + tr.name"
                    class="w-16 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 tabular-nums font-bold"
                  />
                  <span>%</span>
                </div>
              </div>
            }
          </div>

          <div class="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <input type="text" [value]="newTaxName()" (input)="newTaxName.set($any($event.target).value)" placeholder="اسم الضريبة (مثلاً دمغة)" aria-label="اسم الضريبة الجديدة" class="flex-1 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs" />
            <input type="number" [value]="newTaxRate()" (input)="newTaxRate.set(+$any($event.target).value)" placeholder="%" aria-label="قيمة الضريبة الجديدة" class="w-16 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs tabular-nums" />
            <button type="button" (click)="addTaxRate()" class="px-3 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs">إضافة</button>
          </div>
        </div>

        <!-- Engineers & Supervisors List -->
        <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 class="text-sm font-bold text-slate-900 dark:text-white">المهندسين والمشرفين (لأوامر الإضافي)</h3>
          <div class="space-y-1.5 text-xs">
            @for (eng of store.settings().engineers; track eng) {
              <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 font-semibold">{{ eng }}</div>
            }
            @for (sup of store.settings().supervisors; track sup) {
              <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 font-semibold">{{ sup }}</div>
            }
          </div>

          <div class="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <input
              type="text"
              [value]="newEngineerName()"
              (input)="newEngineerName.set($any($event.target).value)"
              placeholder="مثال: المهندس وائل"
              aria-label="اسم مهندس أو مشرف جديد"
              class="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
            <button type="button" (click)="addEngineer()" class="px-3 py-2 rounded-xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-bold text-xs">
              إضافة
            </button>
          </div>
        </div>
      </div>

      <!-- Audit Log Viewer -->
      <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
        <h3 class="text-sm font-bold text-slate-900 dark:text-white">سجل المراجعة والعمليات الحساسة (Audit Log)</h3>
        <div class="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          @for (log of store.auditLogs(); track log.id) {
            <div class="py-2 flex items-center justify-between gap-4">
              <div>
                <span class="font-bold text-slate-900 dark:text-white">{{ log.action }}</span>
                <span class="text-slate-400 mx-1">·</span>
                <span class="text-slate-600 dark:text-slate-300">{{ log.details }}</span>
              </div>
              <span class="text-slate-400 tabular-nums whitespace-nowrap">{{ store.digits(log.timestamp) }}</span>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class SettingsPage {
  readonly store = inject(StoreService);
  private readonly fb = inject(FormBuilder);

  readonly pinInput = signal<string>('');
  readonly monthToToggle = signal<string>('2026-08');
  readonly newTaxName = signal<string>('');
  readonly newTaxRate = signal<number>(2);
  readonly newEngineerName = signal<string>('');

  readonly projectForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    companyDayRate: [500, [Validators.required, Validators.min(1)]],
    companyNightRate: [260, [Validators.required, Validators.min(1)]],
  });

  onDefaultProjectChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    const id = val ? Number(val) : null;
    void this.store.updateSettings({ defaultProjectId: id });
    this.store.selectedProjectId.set(id);
  }

  async savePin(): Promise<void> {
    const pin = this.pinInput().trim();
    await this.store.updateSettings({ pinHash: pin ? pin : null });
    this.store.showToast(
      pin ? 'تم تفعيل قفل PIN للتطبيق' : 'تم إلغاء قفل PIN',
      'success'
    );
    this.pinInput.set('');
  }

  async toggleArchiveMonth(): Promise<void> {
    const m = this.monthToToggle();
    if (!m) return;
    const cur = this.store.settings().lockedMonths || [];
    const next = cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m];
    await this.store.updateSettings({ lockedMonths: next });
    this.store.showToast(
      next.includes(m)
        ? `تم قفل وأرشفة شهر ${m}`
        : `تم فك قفل شهر ${m}`,
      'success'
    );
  }

  async addProject(): Promise<void> {
    if (this.projectForm.invalid) return;
    const v = this.projectForm.getRawValue();
    await this.store.saveProject({
      name: v.name,
      companyDayRate: Number(v.companyDayRate),
      companyNightRate: Number(v.companyNightRate),
      active: true,
      notes: '',
    });
    this.projectForm.reset({ name: '', companyDayRate: 500, companyNightRate: 260 });
    this.store.showToast('تمت إضافة المشروع بنجاح', 'success');
  }

  async updateTaxRateValue(index: number, newRate: number): Promise<void> {
    const rates = this.store.settings().taxRates.map((r, i) =>
      i === index ? { ...r, rate: newRate } : r
    );
    await this.store.updateSettings({ taxRates: rates });
    this.store.showToast('تم تحديث نسبة الضريبة وتحديث الأسطر المفتوحة تلقائياً', 'success');
  }

  async addTaxRate(): Promise<void> {
    const name = this.newTaxName().trim();
    if (!name) return;
    const rate = Number(this.newTaxRate()) || 0;
    const rates = [
      ...this.store.settings().taxRates,
      { name: `${name} (${rate}%)`, rate },
    ];
    await this.store.updateSettings({ taxRates: rates });
    this.newTaxName.set('');
  }

  async addEngineer(): Promise<void> {
    const name = this.newEngineerName().trim();
    if (!name) return;
    const s = this.store.settings();
    if (name.includes('مشرف')) {
      await this.store.updateSettings({ supervisors: [...s.supervisors, name] });
    } else {
      await this.store.updateSettings({ engineers: [...s.engineers, name] });
    }
    this.newEngineerName.set('');
    this.store.showToast(`تمت إضافة ${name} لقائمة المعتمدين`, 'success');
  }
}
