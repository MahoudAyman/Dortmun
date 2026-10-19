import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import { ExcelService } from '../../shared/excel-export';
import type { Worker, WorkerRole } from '../../core/db/models';

@Component({
  selector: 'app-workers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, MatIconModule],
  template: `
    <div class="space-y-6">
      <!-- Top Controls: Search, Role Filter, Import/Add -->
      <div class="flex flex-wrap items-center justify-between gap-4 ceramic-card p-4 lg:p-5 no-print">
        <div class="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
          <div class="relative flex-1 max-w-xs">
            <label for="worker-search" class="sr-only">بحث عن عامل أو نحات</label>
            <input
              id="worker-search"
              type="text"
              [value]="searchQuery()"
              (input)="searchQuery.set($any($event.target).value)"
              placeholder="ابحث بالاسم أو المهنة (نحات، نجار...) أو التليفون"
              class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <mat-icon class="absolute right-2.5 top-2.5 text-slate-400 !text-lg">search</mat-icon>
          </div>

          <div>
            <label for="worker-role-filter" class="sr-only">فلترة بالمهنة</label>
            <select
              id="worker-role-filter"
              [value]="selectedRole()"
              (change)="selectedRole.set($any($event.target).value)"
              class="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3 py-2 text-sm font-bold"
            >
              <option value="all">كل المهن ({{ store.num(store.workers().length) }})</option>
              @for (role of rolesList; track role) {
                <option [value]="role">{{ role }}</option>
              }
            </select>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            (click)="excel.downloadWorkersTemplate()"
            class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold"
          >
            <mat-icon class="!text-base !w-4 !h-4">description</mat-icon>
            <span>قالب Excel</span>
          </button>

          <label class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold cursor-pointer">
            <mat-icon class="!text-base !w-4 !h-4 text-emerald-600">upload_file</mat-icon>
            <span>استيراد عمال</span>
            <input type="file" accept=".xlsx,.xls" class="hidden" (change)="onImportFile($event)" />
          </label>

          <button
            type="button"
            (click)="openWorkerForm()"
            class="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs transition-colors shadow-xs"
          >
            <mat-icon class="!text-lg !w-5 !h-5">person_add</mat-icon>
            <span>إضافة عامل / نحّات جديد</span>
          </button>
        </div>
      </div>

      <!-- Add / Edit Worker Form Panel -->
      @if (showForm()) {
        <form
          [formGroup]="workerForm"
          (ngSubmit)="saveWorker()"
          class="ceramic-card p-6 border-2 border-amber-400 dark:border-amber-600 space-y-4 no-print"
        >
          <div class="flex items-center justify-between">
            <h3 class="text-base font-extrabold text-slate-900 dark:text-white">
              {{ editingWorkerId() ? 'تعديل بيانات العامل / النحّات' : 'إضافة عامل أو نحّات جديد' }}
            </h3>
            <button type="button" (click)="showForm.set(false)" class="text-slate-400 hover:text-slate-600" aria-label="إغلاق النموذج">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label for="w-name" class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">اسم العامل / النحّات *</label>
              <input id="w-name" type="text" formControlName="name" class="w-full px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold" placeholder="مثال: إبراهيم النحات" />
            </div>

            <div>
              <label for="w-role" class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">المهنة *</label>
              <select id="w-role" formControlName="role" class="w-full px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold">
                @for (r of rolesList; track r) {
                  <option [value]="r">{{ r }}</option>
                }
              </select>
            </div>

            <div>
              <label for="w-day-rate" class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">سعر اليومية (ج.م) *</label>
              <input id="w-day-rate" type="number" formControlName="workerDayRate" class="w-full px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold tabular-nums" />
            </div>

            <div>
              <label for="w-night-rate" class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">سعر السهرة (ج.م) *</label>
              <input id="w-night-rate" type="number" formControlName="workerNightRate" class="w-full px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold tabular-nums" />
            </div>

            <div>
              <label for="w-phone" class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">رقم التليفون</label>
              <input id="w-phone" type="text" formControlName="phone" class="w-full px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums" placeholder="010xxxxxxxx" />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div class="sm:col-span-2">
              <label for="w-notes" class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">ملاحظات حرة</label>
              <input id="w-notes" type="text" formControlName="notes" class="w-full px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm" placeholder="أي ملاحظة تخص العامل أو طريقة الحساب..." />
            </div>

            <div class="flex items-center justify-end gap-2">
              <button type="button" (click)="showForm.set(false)" class="px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold">إلغاء</button>
              <button type="submit" [disabled]="workerForm.invalid" class="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-extrabold text-xs disabled:opacity-50">
                <mat-icon class="!text-base !w-4 !h-4">save</mat-icon>
                <span>حفظ البيانات</span>
              </button>
            </div>
          </div>
        </form>
      }

      <!-- Workers Table & Profile Split -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Workers List -->
        <div class="lg:col-span-2 ceramic-card overflow-hidden no-print">
          <div class="overflow-x-auto">
            <table class="w-full text-right text-sm">
              <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th class="py-3 px-4 font-bold">العامل والمهنة</th>
                  <th class="py-3 px-3 font-bold">اليومية / السهرة</th>
                  <th class="py-3 px-3 font-bold">أيام الشهر</th>
                  <th class="py-3 px-3 font-bold">السلف والخصومات</th>
                  <th class="py-3 px-3 font-bold">الصافي المتبقي</th>
                  <th class="py-3 px-4 font-bold">إجراءات</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                @for (item of workerRows(); track item.worker.id) {
                  <tr
                    class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                    [class.bg-amber-50/50]="selectedWorkerId() === item.worker.id"
                    (click)="selectedWorkerId.set(item.worker.id!); store.openWorkerSheet(item.worker.id!)"
                  >
                    <td class="py-3 px-4">
                      <div class="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>{{ item.worker.name }}</span>
                        <span class="px-2 py-0.5 rounded-md bg-[#3390EC]/10 text-[#3390EC] text-[10px] font-bold">
                          اضغط للتفاصيل الكاملة
                        </span>
                      </div>
                      <div class="text-xs text-slate-500">
                        <span class="font-bold text-amber-600 dark:text-amber-400">{{ item.worker.role }}</span>
                        @if (item.worker.notes) {
                          <span> · {{ item.worker.notes }}</span>
                        }
                      </div>
                    </td>
                    <td class="py-3 px-3 tabular-nums text-xs">
                      <div class="font-bold">{{ store.money(item.worker.workerDayRate) }}</div>
                      <div class="text-slate-400">سهرة: {{ store.money(item.worker.workerNightRate) }}</div>
                    </td>
                    <td class="py-3 px-3 tabular-nums">
                      <span class="font-extrabold">{{ store.num(item.monthDays) }}</span> يوم
                      @if (item.monthNights > 0) {
                        <span class="text-xs text-slate-500"> · {{ store.num(item.monthNights) }} سهرة</span>
                      }
                    </td>
                    <td class="py-3 px-3 tabular-nums text-xs">
                      <div class="text-rose-600 dark:text-rose-400 font-bold">سلف: {{ store.money(item.unsettledAdvances) }}</div>
                      @if (item.unsettledDeductions > 0) {
                        <div class="text-rose-700 dark:text-rose-300 font-bold">خصم: {{ store.money(item.unsettledDeductions) }}</div>
                      }
                    </td>
                    <td class="py-3 px-3 tabular-nums font-extrabold text-emerald-600 dark:text-emerald-400">
                      {{ store.money(item.netBalance) }}
                    </td>
                    <td class="py-3 px-4 relative" (click)="$event.stopPropagation()">
                      <div class="flex items-center gap-1">
                        <button
                          type="button"
                          (click)="selectedWorkerId.set(item.worker.id!); store.openWorkerSheet(item.worker.id!)"
                          class="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                          [attr.aria-label]="'عرض ملف ' + item.worker.name"
                          title="فتح لوحة العامل النصفية الكاملة"
                        >
                          <mat-icon class="!text-base !w-4 !h-4">visibility</mat-icon>
                        </button>
                        <button
                          type="button"
                          (click)="openWorkerForm(item.worker)"
                          class="hidden sm:inline-flex p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-blue-600 cursor-pointer"
                          [attr.aria-label]="'تعديل ' + item.worker.name"
                          title="تعديل"
                        >
                          <mat-icon class="!text-base !w-4 !h-4">edit</mat-icon>
                        </button>
                        <!-- Three-Dots (⋮) Comprehensive Worker Actions Menu -->
                        <button
                          type="button"
                          (click)="toggleWorkerMenu(item.worker.id!)"
                          class="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-amber-500/20 text-slate-700 dark:text-amber-300 cursor-pointer"
                          [attr.aria-label]="'المزيد من الإجراءات لـ ' + item.worker.name"
                          title="المزيد من التفاصيل والإجراءات (⋮)"
                        >
                          <mat-icon class="!text-base !w-4 !h-4">more_vert</mat-icon>
                        </button>

                        @if (openWorkerMenuId() === item.worker.id) {
                          <div
                            class="fixed inset-0 z-40"
                            (click)="openWorkerMenuId.set(null)"
                          ></div>
                          <div
                            class="absolute left-4 top-11 w-60 rounded-2xl bg-slate-900 text-white border border-slate-700 shadow-2xl p-2 z-50 space-y-1 text-right"
                            (click)="$event.stopPropagation()"
                          >
                            <div class="px-2.5 py-1 text-[10px] font-extrabold text-amber-400 border-b border-slate-800 truncate">
                              إجراءات: {{ item.worker.name }}
                            </div>
                            <button
                              type="button"
                              (click)="selectedWorkerId.set(item.worker.id!); store.openWorkerSheet(item.worker.id!); openWorkerMenuId.set(null)"
                              class="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-slate-800 text-xs font-bold cursor-pointer"
                            >
                              <mat-icon class="!w-4 !h-4 !text-[16px] text-amber-400">layers</mat-icon>
                              <span>فتح لوحة التحكم الكاملة للعامل</span>
                            </button>
                            <button
                              type="button"
                              (click)="store.payOutWorkerFullBalance(item.worker.id!); openWorkerMenuId.set(null)"
                              class="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-emerald-950/60 text-emerald-300 text-xs font-bold cursor-pointer"
                            >
                              <mat-icon class="!w-4 !h-4 !text-[16px] text-emerald-400">paid</mat-icon>
                              <span>اديله حسابه بالكامل ({{ store.money(item.netBalance) }})</span>
                            </button>
                            <button
                              type="button"
                              (click)="copyWorkerStatementToWhatsApp(item); openWorkerMenuId.set(null)"
                              class="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-slate-800 text-xs font-bold cursor-pointer"
                            >
                              <mat-icon class="!w-4 !h-4 !text-[16px] text-emerald-400">share</mat-icon>
                              <span>نسخ كشف الحساب للواتساب</span>
                            </button>
                            <button
                              type="button"
                              (click)="openWorkerForm(item.worker); openWorkerMenuId.set(null)"
                              class="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-slate-800 text-xs font-bold cursor-pointer"
                            >
                              <mat-icon class="!w-4 !h-4 !text-[16px] text-blue-400">edit</mat-icon>
                              <span>تعديل اليومية والبيانات</span>
                            </button>
                            <button
                              type="button"
                              (click)="store.deleteWorkerCompletelyWithAllRecords(item.worker.id!); openWorkerMenuId.set(null)"
                              class="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-rose-950/60 text-rose-300 text-xs font-bold cursor-pointer"
                            >
                              <mat-icon class="!w-4 !h-4 !text-[16px] text-rose-400">delete_forever</mat-icon>
                              <span>حذفه خالص مع التحضير والسلف</span>
                            </button>
                          </div>
                        }
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="py-12 text-center space-y-3">
                      <div class="text-sm font-bold text-slate-500">لا يوجد عمال أو نحّاتية مسجلون حالياً (جميع الأرقام مصفّرة).</div>
                      <button
                        type="button"
                        (click)="openWorkerForm()"
                        class="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-amber-500 text-slate-950 font-extrabold text-xs"
                      >
                        <mat-icon class="!text-sm !w-4 !h-4">person_add</mat-icon>
                        <span>أضف أول عامل أو نحّات الآن</span>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Detailed Worker Profile & Printable Monthly Statement -->
        <div class="ceramic-card p-5 space-y-4">
          @if (selectedWorkerProfile(); as profile) {
            <div class="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 class="text-lg font-extrabold text-slate-900 dark:text-white">{{ profile.worker.name }}</h3>
                <p class="text-xs text-slate-500">
                  {{ profile.worker.role }} · تليفون: {{ store.digits(profile.worker.phone || 'غير مسجل') }}
                </p>
                @if (profile.worker.notes) {
                  <p class="text-xs text-amber-600 dark:text-amber-400 mt-1">ملاحظة: {{ profile.worker.notes }}</p>
                }
              </div>
              <button
                type="button"
                (click)="printWorkerStatement()"
                class="no-print inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold"
              >
                <mat-icon class="!text-sm !w-4 !h-4">print</mat-icon>
                <span>طباعة كشف حساب</span>
              </button>
            </div>

            <!-- Summary Metrics -->
            <div class="grid grid-cols-2 gap-3 text-xs">
              <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                <div class="text-slate-500">أيام وسهرات الشهر</div>
                <div class="text-base font-extrabold tabular-nums mt-0.5">
                  {{ store.num(profile.monthDays) }} يوم · {{ store.num(profile.monthNights) }} سهرة
                </div>
              </div>
              <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                <div class="text-slate-500">إجمالي الأجور المستحقة</div>
                <div class="text-base font-extrabold tabular-nums mt-0.5">{{ store.money(profile.grossWages) }}</div>
              </div>
              <div class="p-3 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20">
                <div class="text-rose-600 dark:text-rose-400">السلف والخصومات المفتوحة</div>
                <div class="text-base font-extrabold tabular-nums text-rose-600 mt-0.5">
                  {{ store.money(profile.unsettledAdvances + profile.unsettledDeductions) }}
                </div>
              </div>
              <div class="p-3 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20">
                <div class="text-emerald-700 dark:text-emerald-400">صافي الرصيد المتبقي</div>
                <div class="text-base font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">{{ store.money(profile.netBalance) }}</div>
              </div>
            </div>

            <!-- Quick Links & Direct Control Actions for Selected Worker -->
            <div class="flex flex-wrap gap-2 no-print">
              <button
                type="button"
                (click)="store.openWorkerSheet(profile.worker.id!)"
                class="w-full py-2.5 px-3 rounded-xl bg-[#3390EC] text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <mat-icon class="!text-sm !w-4 !h-4">layers</mat-icon>
                <span>فتح لوحة التحكم الكاملة للعامل (إضافة/خصم أيام · سلفة · تصفية · حذف)</span>
              </button>
              <button
                type="button"
                (click)="store.payOutWorkerFullBalance(profile.worker.id!)"
                class="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-extrabold inline-flex items-center gap-1 cursor-pointer"
              >
                <mat-icon class="!text-sm !w-4 !h-4">paid</mat-icon>
                <span>اديله حسابه بالكامل ({{ store.money(profile.netBalance) }})</span>
              </button>
              <button
                type="button"
                (click)="store.deleteWorkerCompletelyWithAllRecords(profile.worker.id!)"
                class="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-extrabold inline-flex items-center gap-1 cursor-pointer"
              >
                <mat-icon class="!text-sm !w-4 !h-4">delete_forever</mat-icon>
                <span>احذفه خالص مع التحضير</span>
              </button>
              <a
                routerLink="/deductions"
                class="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-bold inline-flex items-center gap-1"
              >
                <mat-icon class="!text-sm !w-4 !h-4">gavel</mat-icon>
                <span>تحويل لتسجيل خصم</span>
              </a>
              <a
                routerLink="/settlements"
                class="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold inline-flex items-center gap-1"
              >
                <mat-icon class="!text-sm !w-4 !h-4">payments</mat-icon>
                <span>تحويل لقبض يوم ١٥</span>
              </a>
            </div>

            <!-- Full Ledger History -->
            <div>
              <h4 class="text-xs font-extrabold text-slate-500 mb-2">سجل الحركات الكامل (حضور، سلف، خصومات، ناش)</h4>
              <div class="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                @for (tx of profile.ledger; track $index) {
                  <div class="py-2 flex items-center justify-between gap-2">
                    <div>
                      <span class="font-bold text-slate-800 dark:text-slate-200">{{ tx.title }}</span>
                      <span class="text-slate-400 mr-1.5 tabular-nums">{{ store.digits(tx.date) }}</span>
                      @if (tx.note) {
                        <p class="text-[11px] text-slate-500">{{ tx.note }}</p>
                      }
                    </div>
                    <span
                      class="font-extrabold tabular-nums whitespace-nowrap"
                      [class.text-emerald-600]="tx.amount >= 0"
                      [class.text-rose-600]="tx.amount < 0"
                    >
                      {{ store.money(tx.amount) }}
                    </span>
                  </div>
                } @empty {
                  <div class="py-6 text-center text-slate-400">لا توجد حركات مسجلة لهذا العامل بعد.</div>
                }
              </div>
            </div>
          } @else {
            <div class="py-12 text-center text-xs text-slate-400">
              اختر عاملاً أو نحّاتاً من القائمة لعرض ملفه المالي الكامل.
            </div>
          }
        </div>
      </div>

      <!-- Delete Confirmation Modal -->
      @if (workerToDelete(); as target) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div class="ceramic-card p-6 max-w-sm w-full space-y-4">
            <h3 class="text-base font-extrabold text-slate-900 dark:text-white">تأكيد حذف العامل</h3>
            <p class="text-sm text-slate-600 dark:text-slate-300">
              هل أنت متأكد من حذف العامل <strong>{{ target.name }}</strong>؟ سيتم تسجيل العملية في سجل المراجعة.
            </p>
            <div class="flex justify-end gap-2">
              <button type="button" (click)="workerToDelete.set(null)" class="px-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold">إلغاء</button>
              <button type="button" (click)="executeDelete()" class="px-4 py-2 rounded-2xl bg-rose-600 text-white font-extrabold text-xs">تأكيد الحذف</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class WorkersPage {
  readonly store = inject(StoreService);
  readonly excel = inject(ExcelService);
  private readonly fb = inject(FormBuilder);

  readonly rolesList: WorkerRole[] = [
    'نحات',
    'نجار',
    'نقاش',
    'حداد',
    'مشرف',
    'عامل',
    'بناء',
    'كهربائي',
    'سباك',
    'مبلط',
    'أخرى',
  ];
  readonly searchQuery = signal<string>('');
  readonly selectedRole = signal<string>('all');
  readonly showForm = signal<boolean>(false);
  readonly editingWorkerId = signal<number | null>(null);
  readonly selectedWorkerId = signal<number>(1);
  readonly workerToDelete = signal<Worker | null>(null);

  readonly workerForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    role: ['نحات' as WorkerRole, Validators.required],
    workerDayRate: [400, [Validators.required, Validators.min(1)]],
    workerNightRate: [200, [Validators.required, Validators.min(0)]],
    phone: [''],
    notes: [''],
  });

  readonly workerRows = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const role = this.selectedRole();
    const month = this.store.selectedMonth();
    const attendances = this.store.attendances();
    const advances = this.store.advances();
    const deductions = this.store.deductions();
    const extraCashes = this.store.extraCashes();

    return this.store
      .workers()
      .filter((w) => {
        if (role !== 'all' && w.role !== role) return false;
        if (
          q &&
          !w.name.toLowerCase().includes(q) &&
          !w.role.toLowerCase().includes(q) &&
          !(w.phone || '').includes(q)
        ) {
          return false;
        }
        return true;
      })
      .map((worker) => {
        const wAtt = attendances.filter(
          (a) => a.workerId === worker.id && a.date.startsWith(month)
        );
        const monthDays = wAtt.reduce((s, a) => s + a.dayWorked, 0);
        const monthNights = wAtt.reduce((s, a) => s + a.nightWorked, 0);
        const grossWages = wAtt.reduce(
          (s, a) =>
            s +
            (a.dayWorked ? a.workerDayRateSnapshot : 0) +
            (a.nightWorked ? a.workerNightRateSnapshot : 0),
          0
        );
        const unsettledAdvances = advances
          .filter((adv) => adv.workerId === worker.id && adv.settlementId === null)
          .reduce((s, adv) => s + adv.amount, 0);
        const unsettledDeductions = deductions
          .filter((ded) => ded.workerId === worker.id && ded.settlementId === null)
          .reduce((s, ded) => s + ded.amount, 0);
        const unpaidNash = extraCashes
          .filter((ec) => ec.workerId === worker.id)
          .reduce((s, ec) => s + Math.max(0, ec.amount - ec.paidCash), 0);

        return {
          worker,
          monthDays,
          monthNights,
          grossWages: grossWages + unpaidNash,
          unsettledAdvances,
          unsettledDeductions,
          netBalance:
            grossWages + unpaidNash - unsettledAdvances - unsettledDeductions,
        };
      });
  });

  readonly selectedWorkerProfile = computed(() => {
    const id = this.selectedWorkerId();
    const row =
      this.workerRows().find((r) => r.worker.id === id) || this.workerRows()[0];
    if (!row) return null;

    const wId = row.worker.id!;
    const attEntries = this.store
      .attendances()
      .filter((a) => a.workerId === wId)
      .map((a) => ({
        date: a.date,
        title: `${a.dayWorked ? 'يومية' : ''}${a.dayWorked && a.nightWorked ? ' + ' : ''}${a.nightWorked ? 'سهرة' : ''} (${this.store.projectName(a.projectId)})`,
        amount:
          (a.dayWorked ? a.workerDayRateSnapshot : 0) +
          (a.nightWorked ? a.workerNightRateSnapshot : 0),
        note: a.note,
      }));

    const advEntries = this.store
      .advances()
      .filter((adv) => adv.workerId === wId)
      .map((adv) => ({
        date: adv.date,
        title: `سلفة (${adv.reason})`,
        amount: -adv.amount,
        note: adv.notes,
      }));

    const dedEntries = this.store
      .deductions()
      .filter((ded) => ded.workerId === wId)
      .map((ded) => ({
        date: ded.date,
        title: `خصم (${ded.reason})`,
        amount: -ded.amount,
        note: ded.notes,
      }));

    const ledger = [...attEntries, ...advEntries, ...dedEntries].sort((a, b) =>
      b.date.localeCompare(a.date)
    );

    return {
      ...row,
      ledger,
    };
  });

  openWorkerForm(worker?: Worker): void {
    if (worker) {
      this.editingWorkerId.set(worker.id || null);
      this.workerForm.patchValue({
        name: worker.name,
        role: worker.role as WorkerRole,
        workerDayRate: worker.workerDayRate,
        workerNightRate: worker.workerNightRate,
        phone: worker.phone,
        notes: worker.notes,
      });
    } else {
      this.editingWorkerId.set(null);
      this.workerForm.reset({
        name: '',
        role: 'نحات',
        workerDayRate: this.store.settings().defaultWorkerDayRate || 400,
        workerNightRate: this.store.settings().defaultWorkerNightRate || 200,
        phone: '',
        notes: '',
      });
    }
    this.showForm.set(true);
  }

  async saveWorker(): Promise<void> {
    if (this.workerForm.invalid) return;
    const val = this.workerForm.getRawValue();
    await this.store.saveWorker({
      id: this.editingWorkerId() ?? undefined,
      name: val.name,
      role: val.role,
      workerDayRate: Number(val.workerDayRate),
      workerNightRate: Number(val.workerNightRate),
      phone: val.phone,
      active: true,
      notes: val.notes,
    });
    this.showForm.set(false);
    this.store.showToast('تم حفظ بيانات العامل بنجاح', 'success');
  }

  readonly openWorkerMenuId = signal<number | null>(null);

  toggleWorkerMenu(workerId: number): void {
    this.openWorkerMenuId.update((curr) => (curr === workerId ? null : workerId));
  }

  copyWorkerStatementToWhatsApp(item: {
    worker: Worker;
    monthDays: number;
    monthNights: number;
    grossWages: number;
    unsettledAdvances: number;
    unsettledDeductions: number;
    netBalance: number;
  }): void {
    const lines = [
      `👷 *كشف حساب العامل: ${item.worker.name} (${item.worker.role})*`,
      `• اليومية: ${this.store.money(item.worker.workerDayRate)} | السهرة: ${this.store.money(item.worker.workerNightRate)}`,
      `• إجمالي أيام الشهر: ${this.store.num(item.monthDays)} يوم و ${this.store.num(item.monthNights)} سهرة`,
      `• إجمالي الأجور المستحقة: ${this.store.money(item.grossWages)}`,
      `• السلف المسحوبة: ${this.store.money(item.unsettledAdvances)}`,
      `• الخصومات والجزاءات: ${this.store.money(item.unsettledDeductions)}`,
      `• الصافي المتبقي: ${this.store.money(item.netBalance)}`,
    ];
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(lines.join('\n'));
    }
    this.store.showToast(`تم نسخ كشف حساب ${item.worker.name} للواتساب`, 'success');
  }

  confirmDelete(worker: Worker): void {
    this.workerToDelete.set(worker);
  }

  async executeDelete(): Promise<void> {
    const target = this.workerToDelete();
    if (target?.id) {
      await this.store.deleteWorker(target.id);
    }
    this.workerToDelete.set(null);
  }

  async onImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      await this.excel.importWorkersFromExcel(file);
      input.value = '';
    }
  }

  printWorkerStatement(): void {
    window.print();
  }
}
