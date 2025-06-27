import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createWorkspace, isValidWorkspaceId } from "@/lib/workspace";

const WorkspaceLanding = () => {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = () => {
    const trimmedInput = inputValue.trim();

    if (!trimmedInput) {
      setError("Vui lòng nhập thông tin");
      return;
    }

    // Check if input looks like a workspace ID (contains hyphen and follows pattern)
    if (isValidWorkspaceId(trimmedInput)) {
      // Join existing workspace
      navigate(`/workspace/${trimmedInput}`);
    } else {
      // Create new workspace from name
      try {
        const workspace = createWorkspace(trimmedInput);
        navigate(`/workspace/${workspace.id}`);
      } catch (error) {
        setError("Lỗi tạo workspace");
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center px-4 py-8">
      {/* Background Gradient */}
      <div className="fixed inset-0 w-full h-full bg-gradient-to-br from-gray-900 via-gray-800 to-black" />

      {/* Main container - Match Figma exact sizing */}
      <div
        className="relative z-10 inline-flex p-4 justify-center items-center gap-4 rounded-2xl backdrop-blur-sm"
        style={{
          background: "rgba(47, 47, 49, 0.40)",
          width: "375px",
          height: "288px",
        }}
      >
        <div
          className="flex w-full p-4 flex-col justify-center items-center gap-4 rounded-xl backdrop-blur-sm"
          style={{
            background: "rgba(0, 0, 0, 0.80)",
            width: "343px",
          }}
        >
          {/* Logo Section */}
          <div className="flex justify-between items-center self-stretch">
            <div className="w-[100px] h-[29px] flex items-center">
              <img
                src="https://cdn.builder.io/api/v1/image/assets%2Fd06e69fb86f44047b7162ed72bfce147%2Fc856bd55bf444bdc87ae48267a15e726?format=webp&width=800"
                alt="ZONE Logo"
                className="h-full object-contain"
              />
            </div>
          </div>

          {/* Input Section */}
          <div className="flex flex-col items-start gap-2 self-stretch">
            <div
              className="text-white font-montserrat font-medium leading-4"
              style={{ fontSize: "12px" }}
            >
              Nhập hoặc tạo mới workspace của bạn
            </div>

            <div
              className="flex px-4 py-2 items-center gap-2.5 self-stretch rounded-xl border"
              style={{
                background: "#151515",
                borderColor: "rgba(255, 255, 255, 0.10)",
              }}
            >
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Nhập thông tin"
                className="flex-1 bg-transparent border-none outline-none font-montserrat"
                style={{
                  color: "#636363",
                  fontSize: "14px",
                  lineHeight: "24px",
                }}
              />
            </div>

            {/* Error message */}
            {error && (
              <div
                className="self-stretch font-montserrat font-normal leading-6"
                style={{
                  color: "#EC1C24",
                  fontSize: "14px",
                }}
              >
                Lỗi: {error}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            className="flex h-11 px-4 py-[18px] justify-center items-center gap-4 self-stretch rounded-lg transition-colors hover:opacity-90"
            style={{ background: "#C60927" }}
          >
            <div
              className="text-white text-center font-montserrat font-bold leading-5"
              style={{ fontSize: "14px" }}
            >
              Vào phòng nhạc chung
            </div>
          </button>

          {/* Description */}
          <div
            className="self-stretch text-center font-montserrat font-normal"
            style={{
              color: "var(--Neutral-White, #FFF)",
              fontFeatureSettings: "'liga' off, 'clig' off",
              fontSize: "12px",
              fontStyle: "normal",
              fontWeight: "400",
              lineHeight: "16px",
            }}
          >
            Share workspace-ID hoặc copy đường dẫn để mời đồng nghiệp lên nhạc
            cùng nhé babe
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceLanding;
