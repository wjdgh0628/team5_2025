/**
 * 카메라 세부 옵션에 대한 타입 정의입니다.
 * pitch, bearing 등 공통된 속성을 묶어서 관리합니다.
 */
interface CameraOptions {
    zoom: number;
    pitch: number;
    bearing: number;
    speed?: number; // speed와 curve는 선택적 프로퍼티로 지정
    curve?: number;
}

/**
 * CONFIG 객체 전체의 구조를 정의하는 타입입니다.
 */
interface Config {
    map: {
        center: [number, number];
        zoom: number;
        style: string;
    };
    camera: {
        building: string;
        floor: string;
        around: CameraOptions;
        above: Partial<CameraOptions>; // bearing이 없으므로 Partial로 지정
        reset: CameraOptions;
    };
    buildingDefaults: {
        floorThickness: number;
        floorGap: number;
        colorPalette: string[];
        basementPalette: string[];
    };
    defaultFloorCount: number;
    campus: {
        geojsonUrl: string;
        floorsUrl: string;
        roomsUrl: string;
        idProp: string;
        nameProp: string;
    };
}

/**
 * 타입이 적용된 설정(Configuration) 객체입니다.
 * 이 객체를 다른 파일에서 import하여 사용합니다.
 */
export const CONFIG: Config = {
    map: {
        center: [126.95336, 37.34524],
        zoom: 16,
        style: "mapbox://styles/mapbox/streets-v12"
    },
    camera: {
        building: "around",
        floor: "above",
        around: { zoom: 18, pitch: 60, bearing: -45, speed: 0.8, curve: 1.25 },
        above: { zoom: 19, pitch: 0, speed: 0.4 }, // bearing이 없어 Partial<CameraOptions> 타입에 해당
        reset: { zoom: 16, pitch: 0, bearing: 0, speed: 1 }
    },
    buildingDefaults: {
        floorThickness: 1,
        floorGap: 5,
        colorPalette: ["#ff0000", "#ff4400", "#ff8800", "#ffcc00", "#ffff00", "#ccff00", "#88ff00", "#44ff00", "#00ff00", "#00ff44", "#00ff88", "#00ffcc", "#00ffff", "#00ccff", "#0088ff", "#0044ff", "#0000ff"],
        basementPalette: ["#4400ff", "#8800ff", "#cc00ff", "#ff00ff"]
    },
    defaultFloorCount: 3,
    campus: {
        geojsonUrl: "./json/buildings.geojson",
        floorsUrl: "./json/floors.json",
        roomsUrl: "./json/rooms.json",
        idProp: "@id",
        nameProp: "name"
    }
};