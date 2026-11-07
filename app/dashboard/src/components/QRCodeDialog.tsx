import {
  ChevronLeftIcon,
  ChevronRightIcon,
  QrCodeIcon,
} from "@heroicons/react/24/outline";
import { QRCodeCanvas } from "qrcode.react";
import { CSSProperties, FC, ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import Slider from "react-slick";
import "slick-carousel/slick/slick-theme.css";
import "slick-carousel/slick/slick.css";
import { useDashboard } from "../contexts/DashboardContext";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
} from "./ui/dialog";
import { Icon } from "./Icon";
import { cn } from "lib/utils";

type SliderArrowProps = {
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  currentSlide?: number;
  slideCount?: number;
  children?: ReactNode;
  "aria-label": string;
};

const SliderArrow: FC<SliderArrowProps> = ({
  className,
  style,
  onClick,
  currentSlide: _currentSlide,
  slideCount: _slideCount,
  children,
  ...rest
}) => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    className={cn("!flex before:content-['']", className)}
    style={style}
    onClick={onClick}
    {...rest}
  >
    {children}
  </Button>
);

const qrClassName = "mx-auto bg-white p-2";

export const QRCodeDialog: FC = () => {
  const { QRcodeLinks, setQRCode, setSubLink, subscribeUrl } = useDashboard();
  const isOpen = QRcodeLinks !== null;
  const [index, setIndex] = useState(0);
  const { t } = useTranslation();
  const onClose = () => {
    setQRCode(null);
    setSubLink(null);
  };

  const subscribeQrLink = String(subscribeUrl).startsWith("/")
    ? window.location.origin + subscribeUrl
    : String(subscribeUrl);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="mx-3 w-fit max-w-3xl">
        <DialogHeader>
          <Icon color="primary">
            <QrCodeIcon className="h-5 w-5 text-white" />
          </Icon>
        </DialogHeader>
        {QRcodeLinks && (
          <div className="flex flex-col items-center justify-center gap-5 px-[50px] lg:flex-row lg:gap-[50px] lg:pr-[60px]">
            {subscribeUrl && (
              <div className="flex flex-col items-center gap-2">
                <QRCodeCanvas
                  className={qrClassName}
                  size={300}
                  level={"L"}
                  includeMargin={false}
                  value={subscribeQrLink}
                />
                <p className="mt-1 block pb-3 text-center">
                  {t("qrcodeDialog.sublink")}
                </p>
              </div>
            )}
            <div className="w-[300px]">
              <Slider
                centerPadding="0px"
                centerMode={true}
                slidesToShow={1}
                slidesToScroll={1}
                dots={false}
                afterChange={setIndex}
                onInit={() => setIndex(0)}
                nextArrow={
                  <SliderArrow aria-label="next">
                    <ChevronRightIcon className="h-6 w-6 text-gray-600 dark:text-white" />
                  </SliderArrow>
                }
                prevArrow={
                  <SliderArrow aria-label="prev">
                    <ChevronLeftIcon className="h-6 w-6 text-gray-600 dark:text-white" />
                  </SliderArrow>
                }
              >
                {QRcodeLinks.map((link, i) => {
                  return (
                    <div key={i} className="flex flex-row items-center">
                      <QRCodeCanvas
                        className={qrClassName}
                        size={300}
                        level={"L"}
                        includeMargin={false}
                        value={link}
                      />
                    </div>
                  );
                })}
              </Slider>
              <p className="mt-1 block pb-3 text-center">
                {index + 1} / {QRcodeLinks.length}
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
