import { getLocale } from '@ghostfolio/common/helper';

import { Clipboard } from '@angular/cdk/clipboard';
import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  input,
  Input,
  OnChanges,
  ViewChild
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { copyOutline } from 'ionicons/icons';
import { isNumber } from 'lodash';
import ms from 'ms';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonIcon, MatButtonModule, NgxSkeletonLoaderModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  selector: 'gf-value',
  styleUrls: ['./value.component.scss'],
  templateUrl: './value.component.html'
})
export class GfValueComponent implements AfterViewInit, OnChanges {
  @Input() colorizeSign = false;
  @Input() deviceType: string;
  @Input() enableCopyToClipboardButton = false;
  @Input() icon = '';
  @Input() isAbsolute = false;
  @Input() isCurrency = false;
  @Input() isDate = false;
  @Input() isPercent = false;
  @Input() isQuantity = false;
  @Input() locale: string;
  @Input() position = '';
  @Input() size: 'large' | 'medium' | 'small' = 'small';
  @Input() subLabel = '';
  @Input() unit = '';
  @Input() value: number | string = '';

  @ViewChild('labelContent', { static: false })
  labelContent!: ElementRef<HTMLSpanElement>;

  public absoluteValue = 0;
  public currencySymbol = '';
  public formattedValue = '';
  public hasLabel = false;
  public isNumber = false;
  public isString = false;
  public useAbsoluteValue = false;

  public constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private clipboard: Clipboard,
    private snackBar: MatSnackBar
  ) {
    addIcons({
      copyOutline
    });
  }

  public readonly precision = input<number>();

  private readonly formatOptions = computed<Intl.NumberFormatOptions>(() => {
    const digits = this.hasPrecision ? this.precision() : 2;

    return {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits
    };
  });

  private get hasPrecision() {
    const precision = this.precision();
    return precision !== undefined && precision >= 0;
  }

  // 数量列动态精度: 小额自动按量级给足有效位(最多8位), 大额2位, 不强制补零
  private getQuantityFormatOptions(value: number): Intl.NumberFormatOptions {
    const absoluteValue = Math.abs(value);
    let maximumFractionDigits: number;

    if (absoluteValue === 0) {
      maximumFractionDigits = 0;
    } else if (absoluteValue >= 1) {
      maximumFractionDigits = 2;
    } else {
      const leadingZeros = Math.floor(-Math.log10(absoluteValue));
      maximumFractionDigits = Math.min(8, leadingZeros + 4);
    }

    return { maximumFractionDigits, minimumFractionDigits: 0 };
  }

  public ngAfterViewInit() {
    if (this.labelContent) {
      const element = this.labelContent.nativeElement;

      this.hasLabel =
        element.children.length > 0 || element.textContent.trim().length > 0;

      this.changeDetectorRef.markForCheck();
    }
  }

  public ngOnChanges() {
    this.initializeVariables();

    // Resolve a currency symbol ($, CA$, CN¥, …) to show as a prefix instead of
    // the currency code suffix
    this.currencySymbol =
      this.isCurrency && this.unit
        ? this.getCurrencySymbol(this.unit, this.locale)
        : '';

    if (this.value || this.value === 0) {
      if (isNumber(this.value)) {
        this.isNumber = true;
        this.isString = false;
        this.absoluteValue = Math.abs(this.value);

        if (this.colorizeSign) {
          if (this.isCurrency) {
            try {
              this.formattedValue = this.absoluteValue.toLocaleString(
                this.locale,
                this.formatOptions()
              );
            } catch {}
          } else if (this.isPercent) {
            try {
              this.formattedValue = (this.absoluteValue * 100).toLocaleString(
                this.locale,
                this.formatOptions()
              );
            } catch {}
          }
        } else if (this.isQuantity) {
          try {
            this.formattedValue = this.value?.toLocaleString(
              this.locale,
              this.getQuantityFormatOptions(this.value as number)
            );
          } catch {}
        } else if (this.isCurrency) {
          try {
            this.formattedValue = this.value?.toLocaleString(
              this.locale,
              this.formatOptions()
            );
          } catch {}
        } else if (this.isPercent) {
          try {
            this.formattedValue = (this.value * 100).toLocaleString(
              this.locale,
              this.formatOptions()
            );
          } catch {}
        } else if (this.hasPrecision) {
          try {
            this.formattedValue = this.value?.toLocaleString(
              this.locale,
              this.formatOptions()
            );
          } catch {}
        } else {
          this.formattedValue = this.value?.toLocaleString(this.locale);
        }

        if (this.isAbsolute) {
          // Remove algebraic sign
          this.formattedValue = this.formattedValue.replace(/^-/, '');
        }
      } else {
        this.isNumber = false;
        this.isString = true;

        if (this.isDate) {
          this.formattedValue = new Date(this.value).toLocaleDateString(
            this.locale,
            {
              day: '2-digit',
              month: '2-digit',
              year: this.deviceType === 'mobile' ? '2-digit' : 'numeric'
            }
          );
        } else {
          this.formattedValue = this.value;
        }
      }
    }

    if (this.formattedValue === '0.00') {
      this.useAbsoluteValue = true;
    }
  }

  public onCopyValueToClipboard() {
    this.clipboard.copy(String(this.value));

    this.snackBar.open(
      '✅ ' + $localize`${this.value} has been copied to the clipboard`,
      undefined,
      {
        duration: ms('3 seconds')
      }
    );
  }

  private getCurrencySymbol(currencyCode: string, locale: string): string {
    try {
      const parts = new Intl.NumberFormat(locale, {
        currency: currencyCode,
        style: 'currency'
      }).formatToParts(0);

      return (
        parts.find((part) => part.type === 'currency')?.value ?? currencyCode
      );
    } catch {
      return currencyCode;
    }
  }

  private initializeVariables() {
    this.absoluteValue = 0;
    this.formattedValue = '';
    this.isNumber = false;
    this.isString = false;
    this.locale = this.locale || getLocale();
    this.useAbsoluteValue = false;
  }
}
