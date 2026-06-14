import {
  getTooltipOptions,
  getVerticalHoverLinePlugin
} from '@ghostfolio/common/chart-helper';
import { primaryColorRgb, secondaryColorRgb } from '@ghostfolio/common/config';
import {
  getBackgroundColor,
  getDateFormatString,
  getLocale,
  getTextColor
} from '@ghostfolio/common/helper';
import { LineChartItem } from '@ghostfolio/common/interfaces';
import { ColorScheme } from '@ghostfolio/common/types';

import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  type ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild
} from '@angular/core';
import {
  type AnimationsSpec,
  Chart,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  TimeScale,
  Tooltip,
  type TooltipOptions
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

import { registerChartConfiguration } from '../chart';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgxSkeletonLoaderModule],
  selector: 'gf-line-chart',
  styleUrls: ['./line-chart.component.scss'],
  templateUrl: './line-chart.component.html'
})
export class GfLineChartComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  @Input() benchmarkDataItems: LineChartItem[] = [];
  @Input() benchmarkLabel = '';
  @Input() colorizeBasedOnPerformance = false;
  @Input() colorScheme: ColorScheme;
  @Input() currency: string;
  @Input() dateRange: string;
  @Input() historicalDataItems: LineChartItem[];
  @Input() isAnimated = false;
  @Input() label: string;
  @Input() locale = getLocale();
  @Input() showGradient = false;
  @Input() showLegend = false;
  @Input() showLoader = true;
  @Input() showXAxis = false;
  @Input() showYAxis = false;
  @Input() unit: string;
  @Input() yMax: number;
  @Input() yMaxLabel: string;
  @Input() yMin: number;
  @Input() yMinLabel: string;

  @ViewChild('chartCanvas') chartCanvas: ElementRef<HTMLCanvasElement>;

  public chart: Chart<'line'>;
  public isLoading = true;

  private readonly ANIMATION_DURATION = 1200;

  public constructor(private changeDetectorRef: ChangeDetectorRef) {
    Chart.register(
      Filler,
      LineController,
      LineElement,
      PointElement,
      LinearScale,
      TimeScale,
      Tooltip
    );

    registerChartConfiguration();
  }

  public ngAfterViewInit() {
    if (this.historicalDataItems) {
      setTimeout(() => {
        // Wait for the chartCanvas
        this.initialize();

        this.changeDetectorRef.markForCheck();
      });
    }
  }

  public ngOnChanges() {
    if (this.historicalDataItems || this.historicalDataItems === null) {
      setTimeout(() => {
        // Wait for the chartCanvas
        this.initialize();

        this.changeDetectorRef.markForCheck();
      });
    }
  }

  public ngOnDestroy() {
    this.chart?.destroy();
  }

  private initialize() {
    this.isLoading = true;
    const benchmarkPrices: number[] = [];
    const labels: string[] = [];
    const marketPrices: number[] = [];

    this.historicalDataItems?.forEach((historicalDataItem, index) => {
      benchmarkPrices.push(this.benchmarkDataItems?.[index]?.value);
      labels.push(historicalDataItem.date);
      marketPrices.push(historicalDataItem.value);
    });

    // Pick the line color: teal by default, or green/red derived from the
    // first-to-last trend when performance coloring is requested
    const lineColorRgb = this.colorizeBasedOnPerformance
      ? this.getPerformanceColorRgb(marketPrices)
      : primaryColorRgb;

    const gradient = this.chartCanvas?.nativeElement
      ?.getContext('2d')
      ?.createLinearGradient(
        0,
        0,
        0,
        ((this.chartCanvas.nativeElement.parentNode as HTMLElement)
          .offsetHeight *
          4) /
          5
      );

    if (gradient && this.showGradient) {
      gradient.addColorStop(
        0,
        `rgba(${lineColorRgb.r}, ${lineColorRgb.g}, ${lineColorRgb.b}, ${
          this.colorizeBasedOnPerformance ? 0.24 : 0.01
        })`
      );
      gradient.addColorStop(1, getBackgroundColor(this.colorScheme));
    }

    const data = {
      labels,
      datasets: [
        {
          borderColor: `rgb(${secondaryColorRgb.r}, ${secondaryColorRgb.g}, ${secondaryColorRgb.b})`,
          borderWidth: 1,
          data: benchmarkPrices,
          fill: false,
          label: this.benchmarkLabel,
          pointRadius: 0,
          spanGaps: false
        },
        {
          backgroundColor: gradient,
          borderColor: `rgb(${lineColorRgb.r}, ${lineColorRgb.g}, ${lineColorRgb.b})`,
          borderWidth: 2,
          data: marketPrices,
          fill: true,
          label: this.label,
          pointRadius: 0
        }
      ]
    };

    if (this.chartCanvas) {
      const animations = {
        x: this.getAnimationConfigurationForAxis({ labels, axis: 'x' }),
        y: this.getAnimationConfigurationForAxis({ labels, axis: 'y' })
      };

      if (this.chart) {
        this.chart.data = data;
        this.chart.options.plugins ??= {};
        this.chart.options.plugins.tooltip =
          this.getTooltipPluginConfiguration();
        this.chart.options.animations = this.isAnimated
          ? animations
          : undefined;

        this.chart.update();
      } else {
        this.chart = new Chart(this.chartCanvas.nativeElement, {
          data,
          options: {
            animations: this.isAnimated ? animations : undefined,
            aspectRatio: 16 / 9,
            elements: {
              point: {
                hoverBackgroundColor: getBackgroundColor(this.colorScheme),
                hoverRadius: 2
              }
            },
            interaction: { intersect: false, mode: 'index' },
            plugins: {
              legend: {
                align: 'start',
                display: this.showLegend,
                position: 'bottom'
              },
              tooltip: this.getTooltipPluginConfiguration(),
              verticalHoverLine: {
                color: `rgba(${getTextColor(this.colorScheme)}, 0.1)`
              }
            },
            scales: {
              x: {
                border: {
                  color: `rgba(${getTextColor(this.colorScheme)}, 0.1)`
                },
                display: this.showXAxis,
                grid: {
                  display: false
                },
                time: {
                  tooltipFormat: getDateFormatString(this.locale),
                  unit: this.getTimeUnit()
                },
                type: 'time'
              },
              y: {
                border: {
                  width: 0
                },
                display: this.showYAxis,
                grid: {
                  color: ({ scale, tick }) => {
                    if (
                      tick.value === 0 ||
                      tick.value === scale.max ||
                      tick.value === scale.min ||
                      tick.value === this.yMax ||
                      tick.value === this.yMin
                    ) {
                      return `rgba(${getTextColor(this.colorScheme)}, 0.1)`;
                    }

                    return 'transparent';
                  }
                },
                max: this.yMax,
                min: this.yMin,
                position: 'right',
                ticks: {
                  callback: (tickValue, index, ticks) => {
                    if (index === 0 || index === ticks.length - 1) {
                      // Only print last and first legend entry

                      if (index === 0 && this.yMinLabel) {
                        return this.yMinLabel;
                      }

                      if (index === ticks.length - 1 && this.yMaxLabel) {
                        return this.yMaxLabel;
                      }

                      if (typeof tickValue === 'number') {
                        return tickValue.toLocaleString(this.locale, {
                          maximumFractionDigits: 2,
                          minimumFractionDigits: 2
                        });
                      }

                      return tickValue;
                    }

                    return '';
                  },
                  display: this.showYAxis,
                  mirror: true,
                  z: 1
                },
                type: 'linear'
              }
            },
            spanGaps: true
          },
          plugins: [
            getVerticalHoverLinePlugin(this.chartCanvas, this.colorScheme)
          ],
          type: 'line'
        });
      }
    }

    this.isLoading = false;
  }

  // Choose a sensible x-axis time unit for the active range (defaults to year)
  private getTimeUnit(): 'day' | 'month' | 'year' {
    switch (this.dateRange) {
      case '1d':
      case '1w':
      case 'wtd':
      case '1m':
      case 'mtd':
        return 'day';
      case '3m':
      case '6m':
      case 'ytd':
      case '1y':
        return 'month';
      default:
        return 'year';
    }
  }

  // Gain/loss colors are driven by the global --gf-color-*-rgb CSS variables so
  // the chart follows the user's 红涨绿跌 / Western color setting
  private getCssColorRgb(variableName: string, fallback: string) {
    const value =
      (typeof getComputedStyle !== 'undefined' &&
        getComputedStyle(document.documentElement)
          .getPropertyValue(variableName)
          .trim()) ||
      fallback;

    const [r, g, b] = value.split(',').map((part) => Number(part.trim()));

    return { r, g, b };
  }

  // Gain color when the series ends at/above where it started, loss otherwise
  private getPerformanceColorRgb(marketPrices: number[]) {
    const validPrices = marketPrices?.filter(
      (price) => typeof price === 'number' && !isNaN(price)
    );

    if (!validPrices?.length) {
      return primaryColorRgb;
    }

    const first = validPrices[0];
    const last = validPrices[validPrices.length - 1];

    return last >= first
      ? this.getCssColorRgb('--gf-color-gain-rgb', '220, 53, 69')
      : this.getCssColorRgb('--gf-color-loss-rgb', '40, 167, 69');
  }

  private getAnimationConfigurationForAxis({
    axis,
    labels
  }: {
    axis: 'x' | 'y';
    labels: string[];
  }): Partial<AnimationsSpec<'line'>[string]> {
    const delayBetweenPoints = this.ANIMATION_DURATION / labels.length;

    return {
      delay(context) {
        if (context.type !== 'data' || context[`${axis}Started`]) {
          return 0;
        }

        context[`${axis}Started`] = true;
        return context.dataIndex * delayBetweenPoints;
      },
      duration: delayBetweenPoints,
      easing: 'linear',
      from: NaN,
      type: 'number'
    };
  }

  private getTooltipPluginConfiguration(): Partial<TooltipOptions<'line'>> {
    return {
      ...getTooltipOptions({
        colorScheme: this.colorScheme,
        currency: this.currency,
        locale: this.locale,
        unit: this.unit
      }),
      mode: 'index',
      position: 'top',
      xAlign: 'center',
      yAlign: 'bottom'
    };
  }
}
