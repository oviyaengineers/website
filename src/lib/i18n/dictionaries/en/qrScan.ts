/** The in-app scanner for the QR code printed on a delivery challan. */

export const qrScan = {
  title: "Scan DC QR",
  intro: "Point the camera at the QR code on a printed Oviya Engineers DC to open it.",
  headerButton: "Scan DC QR code",
  starting: "Starting camera...",
  scanning: "Scanning QR...",
  detected: "QR detected",
  readingImage: "Reading image...",
  cameraOff: "Camera off",
  notOurs: "This QR code is not an Oviya Engineers DC. Point the camera at the code on the DC.",
  imageNoQr:
    "No QR code could be read from this image. Try a closer, sharper photo of the code, or use the camera.",
  permissionDenied:
    "Camera permission was refused. Allow camera access for this site in the browser settings, then tap Try camera again. You can also choose a photo of the QR code.",
  noCamera: "No camera was found on this device. Choose a photo of the QR code instead.",
  unsupported:
    "This browser cannot open the camera here. Use Chrome or Safari over https, or choose a photo of the QR code.",
  cameraStopped:
    "The camera is not running. Tap Try camera again, or choose a photo of the QR code.",
  chooseImage: "Choose QR image",
  retryCamera: "Try camera again",
  tip: "The code does not need to be perfectly straight or still. Hold the phone 10–30 cm from the DC in normal light.",
};
