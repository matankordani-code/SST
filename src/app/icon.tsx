import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2F5D73",
          color: "#F3ECDC",
          fontSize: 190,
          fontWeight: 700,
          letterSpacing: -6,
        }}
      >
        SST
      </div>
    ),
    size,
  );
}
