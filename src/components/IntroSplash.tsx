import { useEffect } from "react";
import "./IntroSplash.css";

type IntroSplashProps = {
  onDone: () => void;
  oncePerSession?: boolean;
};

const LOGO_PATH = `M 629.0 201.0 L 627.0 201.0 L 554.0 373.0 L 320.0 911.0 L 305.0 939.0 L 280.0 973.0 L 263.0 989.0 L 251.0 997.0 L 237.0 1003.0 L 225.0 1005.0 L 224.0 1012.0 L 436.0 1012.0 L 435.0 1005.0 L 413.0 1001.0 L 396.0 991.0 L 379.0 971.0 L 373.0 950.0 L 374.0 930.0 L 381.0 898.0 L 393.0 861.0 L 408.0 825.0 L 425.0 791.0 L 446.0 758.0 L 463.0 737.0 L 491.0 711.0 L 514.0 696.0 L 542.0 683.0 L 570.0 675.0 L 598.0 671.0 L 634.0 672.0 L 673.0 681.0 L 701.0 694.0 L 725.0 711.0 L 743.0 729.0 L 761.0 755.0 L 774.0 786.0 L 779.0 819.0 L 778.0 841.0 L 773.0 863.0 L 764.0 885.0 L 752.0 904.0 L 732.0 925.0 L 718.0 935.0 L 697.0 945.0 L 676.0 950.0 L 651.0 950.0 L 629.0 944.0 L 609.0 932.0 L 595.0 917.0 L 587.0 902.0 L 584.0 892.0 L 583.0 875.0 L 587.0 858.0 L 593.0 846.0 L 605.0 833.0 L 623.0 823.0 L 631.0 821.0 L 647.0 821.0 L 663.0 827.0 L 676.0 840.0 L 680.0 851.0 L 680.0 859.0 L 677.0 870.0 L 671.0 878.0 L 676.0 879.0 L 686.0 871.0 L 691.0 858.0 L 690.0 841.0 L 685.0 830.0 L 669.0 815.0 L 645.0 807.0 L 617.0 810.0 L 597.0 820.0 L 583.0 833.0 L 571.0 854.0 L 567.0 869.0 L 566.0 886.0 L 569.0 903.0 L 577.0 922.0 L 586.0 935.0 L 601.0 949.0 L 624.0 962.0 L 651.0 969.0 L 679.0 969.0 L 708.0 962.0 L 737.0 947.0 L 760.0 927.0 L 783.0 894.0 L 795.0 862.0 L 801.0 820.0 L 842.0 916.0 L 849.0 936.0 L 853.0 955.0 L 851.0 975.0 L 843.0 989.0 L 831.0 999.0 L 820.0 1004.0 L 811.0 1005.0 L 810.0 1012.0 L 1030.0 1012.0 L 1029.0 1005.0 L 1021.0 1004.0 L 1002.0 996.0 L 989.0 987.0 L 972.0 971.0 L 950.0 942.0 L 930.0 906.0 Z M 604.0 345.0 L 606.0 347.0 L 606.0 349.0 L 608.0 352.0 L 608.0 354.0 L 610.0 357.0 L 610.0 359.0 L 613.0 364.0 L 613.0 366.0 L 614.0 367.0 L 614.0 368.0 L 615.0 369.0 L 615.0 371.0 L 618.0 376.0 L 618.0 378.0 L 620.0 381.0 L 620.0 383.0 L 623.0 388.0 L 623.0 390.0 L 625.0 393.0 L 625.0 395.0 L 628.0 400.0 L 628.0 402.0 L 630.0 405.0 L 630.0 407.0 L 633.0 412.0 L 633.0 414.0 L 635.0 417.0 L 635.0 419.0 L 636.0 420.0 L 636.0 421.0 L 638.0 424.0 L 638.0 426.0 L 641.0 431.0 L 641.0 433.0 L 643.0 436.0 L 643.0 438.0 L 646.0 443.0 L 646.0 445.0 L 649.0 450.0 L 649.0 452.0 L 650.0 453.0 L 650.0 454.0 L 651.0 455.0 L 651.0 457.0 L 654.0 462.0 L 654.0 464.0 L 656.0 467.0 L 656.0 469.0 L 659.0 474.0 L 659.0 476.0 L 661.0 479.0 L 661.0 481.0 L 664.0 486.0 L 664.0 488.0 L 666.0 491.0 L 666.0 493.0 L 669.0 498.0 L 669.0 500.0 L 671.0 503.0 L 671.0 505.0 L 673.0 508.0 L 673.0 510.0 L 676.0 515.0 L 676.0 517.0 L 679.0 522.0 L 679.0 524.0 L 681.0 527.0 L 681.0 529.0 L 682.0 530.0 L 682.0 531.0 L 684.0 534.0 L 684.0 536.0 L 687.0 541.0 L 687.0 543.0 L 689.0 546.0 L 689.0 548.0 L 691.0 551.0 L 691.0 553.0 L 694.0 558.0 L 694.0 560.0 L 697.0 565.0 L 697.0 567.0 L 699.0 570.0 L 699.0 572.0 L 701.0 575.0 L 701.0 577.0 L 703.0 580.0 L 703.0 582.0 L 706.0 587.0 L 706.0 589.0 L 709.0 594.0 L 709.0 596.0 L 711.0 599.0 L 711.0 601.0 L 714.0 606.0 L 714.0 608.0 L 716.0 611.0 L 716.0 613.0 L 718.0 616.0 L 718.0 618.0 L 721.0 623.0 L 721.0 625.0 L 722.0 626.0 L 722.0 627.0 L 724.0 630.0 L 724.0 632.0 L 727.0 637.0 L 727.0 639.0 L 729.0 642.0 L 729.0 644.0 L 731.0 647.0 L 731.0 649.0 L 733.0 652.0 L 733.0 654.0 L 736.0 659.0 L 736.0 661.0 L 738.0 664.0 L 738.0 666.0 L 740.0 669.0 L 740.0 671.0 L 743.0 676.0 L 743.0 678.0 L 745.0 681.0 L 745.0 683.0 L 747.0 686.0 L 747.0 688.0 L 748.0 689.0 L 748.0 690.0 L 750.0 693.0 L 750.0 695.0 L 753.0 700.0 L 753.0 702.0 L 754.0 703.0 L 754.0 705.0 L 755.0 706.0 L 755.0 707.0 L 754.0 708.0 L 743.0 697.0 L 742.0 697.0 L 738.0 693.0 L 737.0 693.0 L 733.0 689.0 L 732.0 689.0 L 730.0 687.0 L 729.0 687.0 L 726.0 684.0 L 723.0 683.0 L 721.0 681.0 L 720.0 681.0 L 718.0 679.0 L 715.0 678.0 L 713.0 676.0 L 712.0 676.0 L 711.0 675.0 L 710.0 675.0 L 709.0 674.0 L 708.0 674.0 L 707.0 673.0 L 706.0 673.0 L 705.0 672.0 L 704.0 672.0 L 699.0 669.0 L 697.0 669.0 L 692.0 666.0 L 690.0 666.0 L 687.0 664.0 L 685.0 664.0 L 684.0 663.0 L 682.0 663.0 L 681.0 662.0 L 679.0 662.0 L 678.0 661.0 L 676.0 661.0 L 675.0 660.0 L 672.0 660.0 L 671.0 659.0 L 669.0 659.0 L 668.0 658.0 L 665.0 658.0 L 664.0 657.0 L 661.0 657.0 L 660.0 656.0 L 656.0 656.0 L 655.0 655.0 L 651.0 655.0 L 650.0 654.0 L 645.0 654.0 L 644.0 653.0 L 637.0 653.0 L 636.0 652.0 L 622.0 652.0 L 621.0 651.0 L 606.0 651.0 L 605.0 652.0 L 589.0 652.0 L 588.0 653.0 L 581.0 653.0 L 580.0 654.0 L 574.0 654.0 L 573.0 655.0 L 569.0 655.0 L 568.0 656.0 L 564.0 656.0 L 563.0 657.0 L 559.0 657.0 L 558.0 658.0 L 555.0 658.0 L 554.0 659.0 L 552.0 659.0 L 551.0 660.0 L 548.0 660.0 L 547.0 661.0 L 545.0 661.0 L 544.0 662.0 L 541.0 662.0 L 538.0 664.0 L 536.0 664.0 L 535.0 665.0 L 533.0 665.0 L 532.0 666.0 L 530.0 666.0 L 529.0 667.0 L 528.0 667.0 L 527.0 668.0 L 525.0 668.0 L 520.0 671.0 L 518.0 671.0 L 517.0 672.0 L 516.0 672.0 L 515.0 673.0 L 514.0 673.0 L 513.0 674.0 L 512.0 674.0 L 511.0 675.0 L 510.0 675.0 L 509.0 676.0 L 508.0 676.0 L 507.0 677.0 L 506.0 677.0 L 505.0 678.0 L 504.0 678.0 L 503.0 679.0 L 500.0 680.0 L 498.0 682.0 L 495.0 683.0 L 493.0 685.0 L 490.0 686.0 L 488.0 688.0 L 487.0 688.0 L 485.0 690.0 L 484.0 690.0 L 482.0 692.0 L 481.0 692.0 L 479.0 694.0 L 478.0 694.0 L 475.0 697.0 L 474.0 697.0 L 471.0 700.0 L 470.0 700.0 L 465.0 705.0 L 464.0 705.0 L 460.0 709.0 L 459.0 709.0 L 445.0 723.0 L 444.0 722.0 L 444.0 721.0 L 446.0 718.0 L 446.0 716.0 L 447.0 715.0 L 447.0 713.0 L 450.0 708.0 L 450.0 706.0 L 451.0 705.0 L 451.0 704.0 L 452.0 703.0 L 452.0 701.0 L 455.0 696.0 L 455.0 694.0 L 457.0 691.0 L 457.0 689.0 L 460.0 684.0 L 460.0 682.0 L 462.0 679.0 L 462.0 677.0 L 465.0 672.0 L 465.0 670.0 L 468.0 665.0 L 468.0 663.0 L 470.0 660.0 L 470.0 658.0 L 473.0 653.0 L 473.0 651.0 L 474.0 650.0 L 474.0 649.0 L 476.0 646.0 L 476.0 644.0 L 479.0 639.0 L 479.0 637.0 L 480.0 636.0 L 480.0 635.0 L 481.0 634.0 L 481.0 632.0 L 484.0 627.0 L 484.0 625.0 L 486.0 622.0 L 486.0 620.0 L 489.0 615.0 L 489.0 613.0 L 491.0 610.0 L 491.0 608.0 L 492.0 607.0 L 492.0 606.0 L 494.0 603.0 L 494.0 601.0 L 497.0 596.0 L 497.0 594.0 L 498.0 593.0 L 498.0 592.0 L 499.0 591.0 L 499.0 589.0 L 502.0 584.0 L 502.0 582.0 L 504.0 579.0 L 504.0 577.0 L 506.0 574.0 L 506.0 572.0 L 509.0 567.0 L 509.0 565.0 L 511.0 562.0 L 511.0 560.0 L 513.0 557.0 L 513.0 555.0 L 516.0 550.0 L 516.0 548.0 L 519.0 543.0 L 519.0 541.0 L 521.0 538.0 L 521.0 536.0 L 522.0 535.0 L 522.0 534.0 L 524.0 531.0 L 524.0 529.0 L 527.0 524.0 L 527.0 522.0 L 529.0 519.0 L 529.0 517.0 L 530.0 516.0 L 530.0 515.0 L 532.0 512.0 L 532.0 510.0 L 535.0 505.0 L 535.0 503.0 L 537.0 500.0 L 537.0 498.0 L 540.0 493.0 L 540.0 491.0 L 541.0 490.0 L 541.0 489.0 L 543.0 486.0 L 543.0 484.0 L 546.0 479.0 L 546.0 477.0 L 547.0 476.0 L 547.0 475.0 L 548.0 474.0 L 548.0 472.0 L 551.0 467.0 L 551.0 465.0 L 552.0 464.0 L 552.0 463.0 L 553.0 462.0 L 553.0 460.0 L 556.0 455.0 L 556.0 453.0 L 559.0 448.0 L 559.0 446.0 L 562.0 441.0 L 562.0 439.0 L 564.0 436.0 L 564.0 434.0 L 565.0 433.0 L 565.0 432.0 L 568.0 427.0 L 568.0 425.0 L 569.0 424.0 L 569.0 423.0 L 570.0 422.0 L 570.0 420.0 L 573.0 415.0 L 573.0 413.0 L 576.0 408.0 L 576.0 406.0 L 578.0 403.0 L 578.0 401.0 L 579.0 400.0 L 579.0 399.0 L 582.0 394.0 L 582.0 392.0 L 583.0 391.0 L 583.0 390.0 L 584.0 389.0 L 584.0 387.0 L 587.0 382.0 L 587.0 380.0 L 590.0 375.0 L 590.0 373.0 L 591.0 372.0 L 591.0 371.0 L 592.0 370.0 L 592.0 368.0 L 595.0 363.0 L 595.0 361.0 L 596.0 360.0 L 596.0 359.0 L 597.0 358.0 L 597.0 356.0 L 600.0 351.0 L 600.0 349.0 L 601.0 348.0 L 601.0 347.0 L 603.0 345.0 Z`;
const LEFT_PATH = `M 315 992 C 352 945, 397 835, 452 705 C 510 568, 571 408, 628 220`;
const RIGHT_PATH = `M 628 220 C 684 372, 748 540, 812 694 C 866 824, 916 929, 972 992`;
const SPIRAL_PATH = `M 404 746 C 470 682, 557 648, 643 662 C 724 675, 780 733, 785 807 C 790 881, 747 939, 686 960 C 626 981, 567 959, 546 915 C 526 874, 546 831, 582 814 C 615 798, 651 810, 665 838 C 679 866, 668 892, 647 904`;

export function IntroSplash({
  onDone,
  oncePerSession = true,
}: IntroSplashProps) {
  useEffect(() => {
    const seenKey = "accordbook:intro-seen";

    try {
      if (oncePerSession && window.sessionStorage.getItem(seenKey) === "1") {
        onDone();
        return;
      }
    } catch {
      // Storage can be unavailable in private/restricted browser contexts.
    }

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // Keep the finished mark on screen briefly so the transition into the notebook
    // feels intentional instead of cutting away immediately after the drawing.
    const delay = reduced ? 220 : 2800;

    const timer = window.setTimeout(() => {
      try {
        if (oncePerSession) window.sessionStorage.setItem(seenKey, "1");
      } catch {
        // The intro should never prevent the notebook from becoming usable.
      }
      onDone();
    }, delay);

    return () => window.clearTimeout(timer);
  }, [onDone, oncePerSession]);

  return (
    <div className="accordbook-intro" role="status" aria-label="Opening Accordbook">
      <div className="accordbook-intro__content">
        <svg className="accordbook-intro__mark" viewBox="0 0 1254 1254" aria-hidden="true">
          <defs>
            <filter id="accordbookInkTexture" x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="7" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.55" xChannelSelector="R" yChannelSelector="G" />
            </filter>

            <filter id="accordbookInkSoft" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.4" />
            </filter>

            <filter id="accordbookNibSoft" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="0.5" />
            </filter>
          </defs>

          <g className="accordbook-intro__drawing">
            <circle className="accordbook-intro__drop accordbook-intro__drop--left" cx="315" cy="992" r="12" />
            <circle className="accordbook-intro__drop accordbook-intro__drop--right" cx="628" cy="220" r="11" />
            <circle className="accordbook-intro__drop accordbook-intro__drop--spiral" cx="404" cy="746" r="8" />

            <path className="accordbook-intro__guide accordbook-intro__guide--left" pathLength={1} d={LEFT_PATH} />
            <path className="accordbook-intro__core accordbook-intro__core--left" pathLength={1} d={LEFT_PATH} />

            <path className="accordbook-intro__guide accordbook-intro__guide--right" pathLength={1} d={RIGHT_PATH} />
            <path className="accordbook-intro__core accordbook-intro__core--right" pathLength={1} d={RIGHT_PATH} />

            <path className="accordbook-intro__guide accordbook-intro__guide--spiral" pathLength={1} d={SPIRAL_PATH} />
            <path className="accordbook-intro__core accordbook-intro__core--spiral" pathLength={1} d={SPIRAL_PATH} />

            <ellipse className="accordbook-intro__nib accordbook-intro__nib--left" rx="4.2" ry="10.2">
              <animateMotion dur=".50s" begin=".06s" fill="freeze" path={LEFT_PATH} />
            </ellipse>

            <ellipse className="accordbook-intro__nib accordbook-intro__nib--right" rx="4.2" ry="10.2">
              <animateMotion dur=".50s" begin=".44s" fill="freeze" path={RIGHT_PATH} />
            </ellipse>

            <ellipse className="accordbook-intro__nib accordbook-intro__nib--spiral" rx="3.6" ry="8.2">
              <animateMotion dur=".58s" begin=".82s" fill="freeze" path={SPIRAL_PATH} />
            </ellipse>
          </g>

          <path className="accordbook-intro__final-logo" d={LOGO_PATH} fillRule="evenodd" />
        </svg>

        <div className="accordbook-intro__wordmark">Accordbook</div>
        <div className="accordbook-intro__tagline">A formula notebook for perfumers</div>
        <div className="accordbook-intro__rule" />
      </div>
    </div>
  );
}
