import { useState, useEffect, useRef } from "react";
import * as bodyPix from "@tensorflow-models/body-pix";
import "@tensorflow/tfjs";
import styled from "styled-components";
import Draggable from "react-draggable";
import { ResizableBox } from "react-resizable";
import "react-resizable/css/styles.css";
import myImage from "./movieImage.jpg";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";

const App = () => {
  const [modelReady, setModelReady] = useState(false);
  const [foregroundColor] = useState({ r: 0, g: 0, b: 0, a: 255 });
  const [backgroundColor] = useState({ r: 0, g: 0, b: 0, a: 0 });
  const [height, setHeight] = useState(480);
  const [width, setWidth] = useState(640);
  const [backgroundSrc, setBackgroundSrc] = useState(myImage);
  const [processedImage, setProcessedImage] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const backgroundRef = useRef(null);
  const offCanvasRef = useRef(null);
  const offCtxRef = useRef(null);
  const modelRef = useRef(null);
  const [combinedImage, setCombinedImage] = useState(null);
  const [isDraggingDisabled, setIsDraggingDisabled] = useState(false);
  const boxRef = useRef(null);
  const backgroundImageRef = useRef(null);

  // 모델 로드
  const loadModel = async () => {
    setModelReady(false);
    const model = await bodyPix.load();
    modelRef.current = model;
    setModelReady(true);
  };

  // 웹캠 설정
  const setupCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    videoRef.current.srcObject = stream;

    return new Promise((resolve) => {
      videoRef.current.onloadedmetadata = () => {
        resolve(videoRef.current);
      };
    });
  };

  // 실시간 비디오 렌더링
  const renderVideo = async () => {
    const model = modelRef.current;
    const ctx = canvasRef.current.getContext("2d");
    const background = backgroundRef.current;
    const video = videoRef.current;
    //사람 판별
    const segmentation = await model.segmentPerson(video, {
      flipHorizontal: false,
      internalResolution: "medium",
      segmentationThreshold: 0.7,
    });
    //사람 판별해서 mask를 따주고 표시
    const personMasked = bodyPix.toMask(
      segmentation,
      foregroundColor,
      backgroundColor
    );

    //canvas size를 맞춰서 캠에 보이는 비율에 맞게 사진을 편집하는 코드인데 현재는 무조건 캠 화면이랑 똑같이 가기 때문에 중요도는 낮음
    const canvasWidth = 640;
    const canvasHeight = 480;
    const imgWidth = background.width;
    const imgHeight = background.height;
    const imgAspect = imgWidth / imgHeight;
    const canvasAspect = canvasWidth / canvasHeight;
    let drawWidth, drawHeight, drawX, drawY;
    if (imgAspect > canvasAspect) {
      drawWidth = canvasWidth;
      drawHeight = canvasWidth / imgAspect;
      drawX = 0;
      drawY = (canvasHeight - drawHeight) / 2;
    } else {
      drawHeight = canvasHeight;
      drawWidth = canvasHeight * imgAspect;
      drawY = 0;
      drawX = (canvasWidth - drawWidth) / 2;
    }
    if (background) {
      ctx.drawImage(background, drawX, drawY, drawWidth, drawHeight);
    }

    const offCanvas = offCanvasRef.current;
    const offCtx = offCtxRef.current;

    const oldGCO = offCtx.globalCompositeOperation;

    offCtx.clearRect(0, 0, width, height);
    offCtx.putImageData(personMasked, 0, 0);
    offCtx.globalCompositeOperation = "source-in";
    offCtx.drawImage(video, 0, 0);
    offCtx.globalCompositeOperation = oldGCO;

    ctx.drawImage(offCanvas, 0, 0);

    requestAnimationFrame(renderVideo);
  };

  //화면 세팅
  const setupApp = async () => {
    await loadModel();
    const video = await setupCamera();
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    setWidth(videoWidth);
    setHeight(videoHeight);

    const canvas = canvasRef.current;
    canvas.width = videoWidth;
    canvas.height = videoHeight;
    offCanvasRef.current = new OffscreenCanvas(videoWidth, videoHeight);
    offCtxRef.current = offCanvasRef.current.getContext("2d");

    renderVideo();
  };
  //화면 바뀌는 부분
  const handleFileChange = (evt) => {
    const file = evt.target.files[0];
    const url = URL.createObjectURL(file);
    setBackgroundSrc(url);
  };
  //사진찍기
  const takePhoto = () => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    context.drawImage(videoRef.current, 0, 0);
    const imageData = canvas.toDataURL("image/png");
    removeBackground(imageData);
  };
  //api에 캠 화면 보내서 누끼 따는 코드 (추후 유료버전 쓸 경우 수정 필요)
  const removeBackground = async (imageData) => {
    const base64Image = imageData.split(",")[1];
    const response = await fetch("https://sdk.photoroom.com/v1/segment", {
      method: "POST",
      headers: {
        "X-Api-Key": "sandbox_62e1103902b3204f797f7b9f7293896462eebe92",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image_file_b64: base64Image, size: "auto" }),
    });

    if (!response.ok) {
      console.error("Error removing background:", response.statusText);
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    setProcessedImage(url);
  };
  //누끼 딴 이미지와 포스터이미지 합성해주는 코드
  const combineImages = () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const background = new Image();
    background.crossOrigin = "Anonymous";
    background.src = "/src/movieImage.jpg";
    background.onload = () => {
      canvas.width = 640;
      canvas.height = 480;
      ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

      const overlay = new Image();
      overlay.src = processedImage;
      const resizeBox = boxRef.current.getBoundingClientRect();
      const bgImg = backgroundImageRef.current.getBoundingClientRect();
      console.log(resizeBox.top, bgImg.top);
      overlay.onload = () => {
        console.log(resizeBox, bgImg);
        ctx.drawImage(
          overlay,
          resizeBox.x,
          resizeBox.y - 300,
          resizeBox.width,
          resizeBox.height
        );
        const combinedImage = canvas.toDataURL("image/png");
        setCombinedImage(combinedImage);
      };
    };
    // setProcessedImage(null);
  };
  const downloadImage = () => {
    const link = document.createElement("a");
    link.href = combinedImage;
    link.download = "combined_image.png";
    link.click();
  };

  useEffect(() => {
    setupApp();
  }, []);

  return (
    <div>
      {!modelReady ? (
        <div>Loading model, please wait...</div>
      ) : (
        <div className="container-fluid">
          <div className="row">
            <div className="webcam-source col-sm">
              <video
                ref={videoRef}
                height={height}
                width={width}
                autoPlay
                style={{ display: "none" }}
                playsInline
              ></video>
            </div>
            <div className="background col-sm">
              <img
                src={backgroundSrc}
                alt="background"
                height={height}
                width={width}
                ref={backgroundRef}
              />
              <input type="file" onChange={handleFileChange} />
            </div>
          </div>
          <div className="row">
            <div className="output col-sm center-content">
              <canvas ref={canvasRef} height={height} width={width}></canvas>
            </div>
          </div>
          <button onClick={takePhoto}>Take Photo</button>
          <div>
            {processedImage && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <Container>
                  <BackgroundImage
                    ref={backgroundImageRef}
                    src="/src/movieImage.jpg"
                    alt="Background"
                  />
                  <Draggable
                    disabled={isDraggingDisabled}
                    defaultPosition={{ x: 0, y: 0 }}
                    bounds="parent"
                  >
                    <ResizableBox
                      width={640}
                      height={480}
                      minConstraints={[100, 100]}
                      maxConstraints={[640, 480]}
                      resizeHandles={[
                        "se",
                        "sw",
                        "nw",
                        "ne",
                        "n",
                        "s",
                        "w",
                        "e",
                      ]}
                      onResizeStart={(e) => {
                        e.stopPropagation();
                        setIsDraggingDisabled(true);
                      }}
                      onResizeStop={() => {
                        setIsDraggingDisabled(false);
                      }}
                      // ref={boxRef}
                    >
                      <div
                        ref={boxRef}
                        style={{ width: "100%", height: "100%" }}
                      >
                        <OverlayImage src={processedImage} alt="Overlay" />
                      </div>
                    </ResizableBox>
                  </Draggable>
                </Container>
              </div>
            )}
            <button onClick={combineImages}>Combine Images</button>
            {combinedImage && (
              <div>
                <h3>Combined Image</h3>
                <img src={combinedImage} alt="Combined" />
                <button onClick={downloadImage}>Download Combined Image</button>
              </div>
            )}
          </div>
        </div>
      )}
      <div style={{ width: 100 }}>
        <Swiper spaceBetween={50} slidesPerView={3}>
          <SwiperSlide>slide1</SwiperSlide>
          <SwiperSlide>slide2</SwiperSlide>
          <SwiperSlide>slide3</SwiperSlide>
          <SwiperSlide>slide4</SwiperSlide>
        </Swiper>
      </div>
    </div>
  );
};

export default App;

const Container = styled.div`
  position: relative;
  width: 640px;
  height: 480px;
`;

const BackgroundImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: fill;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
`;

const OverlayImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: pointer;
  z-index: 1;
`;
