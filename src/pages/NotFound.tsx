import { Link } from "react-router-dom";

const NotFound = () => {
  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center px-4">
      {/* Background Image with Overlay */}
      <div
        className="fixed inset-0 w-full h-full"
        style={{
          backgroundImage: `url(https://cdn.builder.io/api/v1/image/assets/TEMP/305c2885b187434732d3086bf2908dd6719ccf95?placeholderIfAbsent=true)`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Main container with overlay */}
      <div className="relative z-10 flex p-4 justify-center items-center gap-4 rounded-3xl bg-black/40 backdrop-blur-sm w-full max-w-md">
        <div className="flex w-full max-w-[343px] p-8 flex-col justify-center items-center gap-6 rounded-xl bg-black/80 backdrop-blur-sm text-center">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="text-red-500 font-bold text-2xl">🎵</div>
            <div className="text-red-500 font-bold text-2xl tracking-wider font-montserrat">
              ZONE
            </div>
          </div>

          {/* Error Message */}
          <div className="flex flex-col gap-4">
            <div className="text-white font-bold text-2xl font-montserrat">
              404
            </div>
            <div className="text-white text-sm font-montserrat">
              Trang bạn đang tìm không tồn tại
            </div>
          </div>

          {/* Back Button */}
          <Link
            to="/"
            className="flex h-11 px-6 py-3 justify-center items-center gap-4 rounded-lg bg-red-600 hover:bg-red-700 transition-colors"
          >
            <div className="text-white text-center text-sm font-bold leading-5 font-montserrat">
              Về trang chủ
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
