import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import type { CheckDirection, CheckItem, CheckStatus } from '../../core/db/models';

@Component({
  selector: 'app-checks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <div class="space-y-6">
      <!-- 3-Day Due Date Alert Banner -->
      @if (store.dueChecksAlerts().length > 0) {
        <div class="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 space-y-2">
          <div class="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-300 text-sm">
            <mat-icon>notifications_active</mat-icon>
            <span>تنبيه استحقاق الشيكات (خلال 3 أيام أو أقل)</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            @for (al of store.dueChecksAlerts(); track al.check.id) {
              <div
                (click)="store.openCheckSheet(al.check.id!)"
                class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800/50 flex items-center justify-between text-xs cursor-pointer hover:border-rose-500"
              >
                <div>
                  <span class="font-bold">شيك {{ al.check.direction }} #{{ al.check.number }} ({{ al.check.bank }})</span>
                  <div class="text-slate-500 mt-0.5">
                    تاريخ الاستحقاق: {{ store.digits(al.check.dueDate) }} (باقي {{ store.num(al.daysRemaining) }} يوم)
                  </div>
                </div>
                <span class="font-extrabold text-rose-600 tabular-nums">{{ store.money(al.check.amount) }}</span>
              </div>
            }
          </div>
        </div>
      }

      <!-- DATA-DRIVEN PROJECT CHECK WITHDRAWAL & SAFE LEDGER ("صفحة ما تم سحبه من شيك المشروع وتم دفع كام سلف وكام مصاريف خارجية والمفروض يكون قاعد كام") -->
      @let pk = store.dailyPocketSummary();
      <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border-2 border-emerald-500/40 shadow-xs space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div class="flex items-center gap-2.5">
            <div class="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <mat-icon>account_balance_wallet</mat-icon>
            </div>
            <div>
              <h2 class="text-base font-black text-slate-900 dark:text-white">
                كشف ما تم سحبه من شيك المشروع والمدفوع سلف ومصاريف والمتبقي
              </h2>
              <p class="text-xs text-slate-500">
                محسوب تلقائياً ١٠٠٪ من السجلات الفعلية (الشيكات المسجلة · السلف · القبض · المصاريف الخارجية ورسوم السحب)
              </p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <select
              aria-label="تصفية حسب المشروع"
              [value]="store.pocketSelectedProjectId() ?? ''"
              (change)="store.pocketSelectedProjectId.set($any($event.target).value ? +$any($event.target).value : null); store.pocketSelectedCheckId.set(null)"
              class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-extrabold"
            >
              <option value="">كل المشاريع</option>
              @for (p of store.projects(); track p.id) {
                <option [value]="p.id">{{ p.name }}</option>
              }
            </select>

            <select
              aria-label="تصفية حسب الشيك"
              [value]="store.pocketSelectedCheckId() ?? ''"
              (change)="onSelectCheckForPocket($any($event.target).value ? +$any($event.target).value : null)"
              class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-extrabold"
            >
              <option value="">كل شيكات المشروع الواردة</option>
              @for (c of pk.projectChecks; track c.id) {
                <option [value]="c.id">شيك #{{ c.number }} ({{ store.money(c.amount) }} - {{ store.projectName(c.projectId) }})</option>
              }
            </select>

            <button
              type="button"
              (click)="store.openPocketSheet(store.pocketSelectedCheckId(), store.pocketSelectedProjectId())"
              class="px-3.5 py-2 rounded-xl bg-[#3390EC] text-white text-xs font-extrabold inline-flex items-center gap-1 cursor-pointer"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">layers</mat-icon>
              <span>التفاصيل في لوحة نصف الصفحة</span>
            </button>
          </div>
        </div>

        <!-- 5 Data-Driven Summary Boxes -->
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
            <div class="text-[11px] font-bold text-slate-500">إجمالي شيكات المشروع</div>
            <div class="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-0.5 tabular-nums">
              {{ store.money(pk.checksIncomingTotal) }}
            </div>
            <div class="text-[10px] text-slate-400 mt-0.5">{{ store.num(pk.projectChecks.length) }} شيك وارد</div>
          </div>

          <div class="p-3.5 rounded-2xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <div class="text-[11px] font-bold text-blue-700 dark:text-blue-300">ما تم سحبه من الشيك</div>
            <div class="text-base sm:text-lg font-black text-blue-600 mt-0.5 tabular-nums">
              {{ store.money(pk.withdrawnAmount) }}
            </div>
            <div class="text-[10px] text-slate-500 mt-0.5">متبقي بالشيك: {{ store.money(pk.remainingInCheck) }}</div>
          </div>

          <div class="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <div class="text-[11px] font-bold text-amber-800 dark:text-amber-300">مدفوع سلف وقبض للعمال</div>
            <div class="text-base sm:text-lg font-black text-amber-600 mt-0.5 tabular-nums">
              {{ store.money(pk.totalWorkersPaid) }}
            </div>
            <div class="text-[10px] text-slate-500 mt-0.5">
              سلف {{ store.money(pk.advancesTotal) }} + قبض {{ store.money(pk.settlementsTotal) }}
            </div>
          </div>

          <div class="p-3.5 rounded-2xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800">
            <div class="text-[11px] font-bold text-rose-700 dark:text-rose-300">مصاريف خارجية ورسوم سحب</div>
            <div class="text-base sm:text-lg font-black text-rose-600 mt-0.5 tabular-nums">
              {{ store.money(pk.totalExternalExpenses) }}
            </div>
            <div class="text-[10px] text-slate-500 mt-0.5">
              مصاريف {{ store.money(pk.externalExpensesTotal) }} + رسوم {{ store.money(pk.withdrawalFee) }}
            </div>
          </div>

          <div class="p-3.5 rounded-2xl bg-emerald-600 text-white col-span-2 sm:col-span-1">
            <div class="text-[11px] font-bold text-emerald-100">المفروض قاعد معاك الآن</div>
            <div class="text-lg sm:text-xl font-black mt-0.5 tabular-nums">
              {{ store.money(pk.netRemainingInPocket) }}
            </div>
            <div class="text-[10px] text-emerald-100 mt-0.5">
              قبل المصاريف: {{ store.money(pk.remainingBeforeExpenses) }}
            </div>
          </div>
        </div>

        <!-- Update Check Withdrawal Bar -->
        <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label class="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">الشيك المسحوب منه</label>
            <select
              [value]="store.pocketSelectedCheckId() ?? ''"
              (change)="onSelectCheckForPocket($any($event.target).value ? +$any($event.target).value : null)"
              class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
            >
              <option value="">اختر الشيك...</option>
              @for (c of store.checks(); track c.id) {
                @if (c.direction === 'وارد') {
                  <option [value]="c.id">شيك #{{ c.number }} ({{ store.money(c.amount) }} - {{ store.projectName(c.projectId) }})</option>
                }
              }
            </select>
          </div>

          <div>
            <label class="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">ما تم سحبه من الشيك (ج.م)</label>
            <input
              type="number"
              min="0"
              [value]="store.pocketWithdrawnAmount() || pk.withdrawnAmount"
              (input)="store.pocketWithdrawnAmount.set(+$any($event.target).value)"
              class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-black tabular-nums"
            />
          </div>

          <div>
            <label class="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">مصاريف / رسوم السحب (ج.م)</label>
            <input
              type="number"
              min="0"
              [value]="store.pocketWithdrawalFee() || pk.withdrawalFee"
              (input)="store.pocketWithdrawalFee.set(+$any($event.target).value)"
              class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-black text-rose-600 tabular-nums"
            />
          </div>

          <button
            type="button"
            (click)="store.savePocketWithdrawalToCheck(true)"
            class="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <mat-icon class="!w-4 !h-4 !text-[16px]">save</mat-icon>
            <span>حفظ السحبة على الشيك</span>
          </button>
        </div>
      </div>

      <!-- Add Check Form (with Project, Extract, and Withdrawal Linkage) -->
      <form
        [formGroup]="checkForm"
        (ngSubmit)="saveCheck()"
        class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4"
      >
        <h2 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <mat-icon class="text-amber-500">account_balance</mat-icon>
          <span>تسجيل شيك جديد وربطه بالمشروع والمستخلص والمنصرف منه</span>
        </h2>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label for="chk-dir" class="block text-xs font-medium mb-1">اتجاه الشيك *</label>
            <select id="chk-dir" formControlName="direction" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold">
              <option value="وارد">وارد (من الشركة للمشروع)</option>
              <option value="صادر">صادر (لمورد / مقاول باطن)</option>
            </select>
          </div>

          <div>
            <label for="chk-num" class="block text-xs font-medium mb-1">رقم الشيك *</label>
            <input id="chk-num" type="text" formControlName="number" placeholder="CHK-90210" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums" />
          </div>

          <div>
            <label for="chk-bank" class="block text-xs font-medium mb-1">البنك *</label>
            <input id="chk-bank" type="text" formControlName="bank" placeholder="البنك الأهلي المصري" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm" />
          </div>

          <div>
            <label for="chk-amt" class="block text-xs font-medium mb-1">قيمة الشيك الكلية (ج.م) *</label>
            <input id="chk-amt" type="number" min="1" formControlName="amount" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-black tabular-nums" />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
          <div>
            <label for="chk-withdrawn" class="block text-xs font-medium mb-1">المبلغ المسحوب منه (ج.م)</label>
            <input id="chk-withdrawn" type="number" min="0" formControlName="withdrawnAmount" placeholder="اتركه فارغاً = كامل الشيك" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold tabular-nums" />
          </div>

          <div>
            <label for="chk-fee" class="block text-xs font-medium mb-1">رسوم / مصاريف السحب (ج.م)</label>
            <input id="chk-fee" type="number" min="0" formControlName="withdrawalFee" placeholder="0" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-rose-600 tabular-nums" />
          </div>

          <div>
            <label for="chk-due" class="block text-xs font-medium mb-1">تاريخ الاستحقاق *</label>
            <input id="chk-due" type="date" formControlName="dueDate" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums" />
          </div>

          <div>
            <label for="chk-status" class="block text-xs font-medium mb-1">الحالة *</label>
            <select id="chk-status" formControlName="status" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold">
              <option value="معلق">معلق</option>
              <option value="اتصرف">اتصرف</option>
              <option value="مرتجع">مرتجع</option>
            </select>
          </div>

          <div>
            <label for="chk-proj" class="block text-xs font-medium mb-1">ربط بأي مشروع / فيلا *</label>
            <select id="chk-proj" formControlName="projectId" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold">
              @for (p of store.projects(); track p.id) {
                <option [ngValue]="p.id">{{ p.name }}</option>
              }
            </select>
          </div>

          <div>
            <label for="chk-ext" class="block text-xs font-medium mb-1">ربط بمستخلص</label>
            <select id="chk-ext" formControlName="extractId" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm">
              <option [ngValue]="null">بدون ربط بمستخلص</option>
              @for (ext of store.extracts(); track ext.id) {
                <option [ngValue]="ext.id">مستخلص #{{ store.num(ext.number) }} - {{ store.projectName(ext.projectId) }}</option>
              }
            </select>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
          <input id="chk-notes" type="text" formControlName="notes" placeholder="ملاحظة حرة عن الشيك أو مكان الصرف..." class="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm" />
          <button type="submit" [disabled]="checkForm.invalid" class="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm disabled:opacity-50 cursor-pointer">
            <mat-icon class="!text-lg !w-5 !h-5">add_card</mat-icon>
            <span>حفظ الشيك وربطه بالمشروع والمستخلص</span>
          </button>
        </div>
      </form>

      <!-- Checks Filter & Linked Breakdown Table -->
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div class="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button type="button" (click)="directionFilter.set('all')" class="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer" [class.bg-white]="directionFilter() === 'all'" [class.dark:bg-slate-900]="directionFilter() === 'all'">الكل</button>
            <button type="button" (click)="directionFilter.set('وارد')" class="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer" [class.bg-white]="directionFilter() === 'وارد'" [class.dark:bg-slate-900]="directionFilter() === 'وارد'">الواردة</button>
            <button type="button" (click)="directionFilter.set('صادر')" class="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer" [class.bg-white]="directionFilter() === 'صادر'" [class.dark:bg-slate-900]="directionFilter() === 'صادر'">الصادرة</button>
          </div>

          <div class="text-xs font-bold tabular-nums">
            إجمالي المعروض: <span class="text-amber-600">{{ store.money(filteredTotal()) }}</span> · اضغط على أي شيك أو مشروع لعرض لوحة التفاصيل السريعة
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-right text-sm">
            <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 text-xs border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th class="py-3 px-4 font-semibold">الشيك والبنك</th>
                <th class="py-3 px-3 font-semibold">المشروع والمستخلص</th>
                <th class="py-3 px-3 font-semibold">قيمة الشيك والمسحوب</th>
                <th class="py-3 px-3 font-semibold">مصروف سلف ومصاريف</th>
                <th class="py-3 px-3 font-semibold">المفروض قاعد معاك</th>
                <th class="py-3 px-3 font-semibold">الحالة</th>
                <th class="py-3 px-4 font-semibold">إجراء</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              @for (cb of filteredBreakdowns(); track cb.check.id) {
                <tr
                  (click)="store.openCheckSheet(cb.check.id!)"
                  class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  <td class="py-3 px-4">
                    <div class="flex items-center gap-1.5">
                      <span
                        class="px-2 py-0.5 rounded-md text-[10px] font-extrabold"
                        [class.bg-emerald-500/15]="cb.check.direction === 'وارد'"
                        [class.text-emerald-600]="cb.check.direction === 'وارد'"
                        [class.bg-rose-500/15]="cb.check.direction === 'صادر'"
                        [class.text-rose-600]="cb.check.direction === 'صادر'"
                      >
                        {{ cb.check.direction }}
                      </span>
                      <span class="font-extrabold tabular-nums">#{{ cb.check.number }}</span>
                    </div>
                    <div class="text-xs text-slate-500 mt-0.5">{{ cb.check.bank }} · {{ store.digits(cb.check.dueDate) }}</div>
                  </td>

                  <td class="py-3 px-3 text-xs" (click)="$event.stopPropagation(); store.openProjectSheet(cb.check.projectId)">
                    <div class="font-extrabold text-[#3390EC] hover:underline">{{ cb.projectName }}</div>
                    @if (cb.extractNumber) {
                      <span class="text-slate-600 dark:text-slate-400 font-bold">مستخلص #{{ store.num(cb.extractNumber) }}</span>
                    } @else {
                      <span class="text-slate-400">اضغط لتفاصيل المشروع</span>
                    }
                  </td>

                  <td class="py-3 px-3 tabular-nums">
                    <div class="font-extrabold">{{ store.money(cb.check.amount) }}</div>
                    <div class="text-[11px] text-blue-600 font-bold">
                      سُحب: {{ store.money(cb.withdrawnAmount) }}
                    </div>
                  </td>

                  <td class="py-3 px-3 text-xs tabular-nums">
                    <div class="font-bold text-amber-600">سلف وقبض: {{ store.money(cb.advancesSpentFromCheck + cb.settlementsPaidFromCheck) }}</div>
                    <div class="font-bold text-rose-600">مصاريف وسحب: {{ store.money(cb.expensesSpentFromCheck) }}</div>
                  </td>

                  <td class="py-3 px-3">
                    <div class="font-black text-emerald-600 tabular-nums">{{ store.money(cb.remainingInPocketNet) }}</div>
                    <div class="text-[11px] text-slate-500 font-bold tabular-nums">
                      متبقي بالشيك: {{ store.money(cb.remainingInCheck) }}
                    </div>
                  </td>

                  <td class="py-3 px-3" (click)="$event.stopPropagation()">
                    <select
                      [value]="cb.check.status"
                      (change)="changeStatus(cb.check, $any($event.target).value)"
                      [attr.aria-label]="'تغيير حالة الشيك ' + cb.check.number"
                      class="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold"
                      [class.text-amber-600]="cb.check.status === 'معلق'"
                      [class.text-emerald-600]="cb.check.status === 'اتصرف'"
                      [class.text-rose-600]="cb.check.status === 'مرتجع'"
                    >
                      <option value="معلق">معلق</option>
                      <option value="اتصرف">اتصرف</option>
                      <option value="مرتجع">مرتجع</option>
                    </select>
                  </td>

                  <td class="py-3 px-4 relative" (click)="$event.stopPropagation()">
                    <div class="flex items-center gap-1">
                      <button
                        type="button"
                        (click)="store.openCheckSheet(cb.check.id!)"
                        class="px-2.5 py-1 rounded-lg bg-[#3390EC]/15 text-[#3390EC] text-xs font-bold cursor-pointer"
                      >
                        التفاصيل
                      </button>
                      <button
                        type="button"
                        (click)="openCheckRowMenuId.set(openCheckRowMenuId() === cb.check.id ? null : cb.check.id!)"
                        class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                        [attr.aria-label]="'المزيد للشيك ' + cb.check.number"
                      >
                        <mat-icon class="!text-base !w-4 !h-4">more_vert</mat-icon>
                      </button>
                    </div>

                    @if (openCheckRowMenuId() === cb.check.id) {
                      <div class="absolute left-4 top-11 z-20 w-44 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg p-1.5 space-y-1 text-xs">
                        <button
                          type="button"
                          (click)="store.openPocketSheet(cb.check.id!, cb.check.projectId); openCheckRowMenuId.set(null)"
                          class="w-full text-right px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <mat-icon class="!w-4 !h-4 !text-[15px] text-emerald-600">account_balance_wallet</mat-icon>
                          <span>سحبة الشيك والمنصرف</span>
                        </button>
                        <button
                          type="button"
                          (click)="store.openProjectSheet(cb.check.projectId); openCheckRowMenuId.set(null)"
                          class="w-full text-right px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <mat-icon class="!w-4 !h-4 !text-[15px] text-blue-600">domain</mat-icon>
                          <span>تفاصيل المشروع</span>
                        </button>
                        <button
                          type="button"
                          (click)="store.deleteCheck(cb.check.id!); openCheckRowMenuId.set(null)"
                          class="w-full text-right px-2.5 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <mat-icon class="!w-4 !h-4 !text-[15px]">delete</mat-icon>
                          <span>حذف الشيك</span>
                        </button>
                      </div>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class ChecksPage {
  readonly store = inject(StoreService);
  private readonly fb = inject(FormBuilder);

  readonly directionFilter = signal<'all' | CheckDirection>('all');
  readonly openCheckRowMenuId = signal<number | null>(null);

  readonly checkForm = this.fb.group({
    direction: ['وارد' as CheckDirection, Validators.required],
    number: ['', Validators.required],
    bank: ['البنك الأهلي المصري', Validators.required],
    amount: [15000, [Validators.required, Validators.min(1)]],
    withdrawnAmount: [null as number | null],
    withdrawalFee: [0],
    dueDate: ['2026-10-19', Validators.required],
    status: ['معلق' as CheckStatus, Validators.required],
    projectId: [1 as number | null],
    extractId: [1 as number | null],
    notes: [''],
  });

  readonly filteredBreakdowns = computed(() => {
    const dir = this.directionFilter();
    return this.store
      .checkFundBreakdowns()
      .filter((cb) => dir === 'all' || cb.check.direction === dir);
  });

  readonly filteredTotal = computed(() =>
    this.filteredBreakdowns().reduce((s, cb) => s + cb.check.amount, 0)
  );

  onSelectCheckForPocket(checkId: number | null): void {
    this.store.pocketSelectedCheckId.set(checkId);
    if (checkId) {
      const chk = this.store.checks().find((c) => c.id === checkId);
      if (chk) {
        this.store.pocketSelectedProjectId.set(chk.projectId);
        this.store.pocketWithdrawnAmount.set(chk.withdrawnAmount ?? chk.amount);
        this.store.pocketWithdrawalFee.set(chk.withdrawalFee ?? 0);
      }
    }
  }

  async saveCheck(): Promise<void> {
    if (this.checkForm.invalid) return;
    const v = this.checkForm.getRawValue();
    const amount = Number(v.amount);
    const withdrawnAmount =
      v.withdrawnAmount !== null && v.withdrawnAmount !== undefined && Number(v.withdrawnAmount) > 0
        ? Number(v.withdrawnAmount)
        : amount;
    const withdrawalFee = Math.max(0, Number(v.withdrawalFee) || 0);

    await this.store.saveCheck({
      direction: (v.direction || 'وارد') as CheckDirection,
      number: v.number || '',
      bank: v.bank || '',
      amount,
      withdrawnAmount,
      withdrawalFee,
      dueDate: v.dueDate || this.store.todayIso(),
      status: (v.status || 'معلق') as CheckStatus,
      projectId: v.projectId ? Number(v.projectId) : 1,
      extractId: v.extractId ? Number(v.extractId) : null,
      notes: v.notes || '',
    });
    this.store.showToast('تم حفظ الشيك وربطه بالمشروع والمستخلص بنجاح', 'success');
    this.checkForm.patchValue({ number: '', notes: '', withdrawnAmount: null, withdrawalFee: 0 });
  }

  async changeStatus(chk: CheckItem, status: CheckStatus): Promise<void> {
    await this.store.saveCheck({ ...chk, status });
    this.store.showToast(`تم تحديث حالة الشيك ${chk.number} إلى ${status}`, 'success');
  }
}

