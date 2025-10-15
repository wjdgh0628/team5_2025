import React, { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl, { Map as MapboxMap } from 'mapbox-gl';
import { CONFIG } from '../config.js';

// Mapbox 액세스 토큰 설정
mapboxgl.accessToken = "pk.eyJ1IjoibGF6eWRldjEwMjQiLCJhIjoiY21mdW91NnNyMTVkZDJtcHd4dHNtNHU0ayJ9.mLzbdcCPq_-BeA8DlHu1KA";

// --- 타입 정의 ---

interface CameraOptions {
    zoom?: number;
    pitch?: number;
    bearing?: number;
    speed?: number;
    curve?: number;
}

// GeoJSON 파일의 properties 객체에 대한 타입
interface BuildingProperties {
    "@id": string;
    "building:levels": number;
    "building:basement": number;
    center: string; // JSON 문자열: "[lng, lat]"
    bearing: string; // JSON 문자열
    // 그 외 다른 프로퍼티들을 허용하기 위한 인덱스 시그니처
    [key: string]: string | number | boolean | null;
}

// 층 하나의 속성 정보 타입
interface FloorSpec {
    level: number;
    name: string;
    base: number;
    height: number;
    color: string;
}

// Mapbox 이벤트 리스너 함수의 타입 별칭
type MapListener = (e: mapboxgl.MapLayerMouseEvent) => void;
// 카메라 모드로 사용할 수 있는 키들을 명확하게 정의
type CameraMode = 'building' | 'floor' | 'reset';

// CONFIG.camera 객체의 타입을 정의
type CameraConfig = {
    [key in CameraMode | 'around' | 'above']: string | CameraOptions;
};
// 선택된 건물 하나에 대한 모든 상태 정보 타입
interface BuildingState {
    coords: number[][];
    floorsSpec: FloorSpec[];
    floorLayerIds: string[];
    sourceId: string;
    properties: BuildingProperties;
    // (수정) 각 레이어 ID에 해당하는 이벤트 리스너를 저장하는 객체
    listeners: { [layerId: string]: MapListener };
}

// 맵의 현재 전역 상태 타입
interface CurrentState {
    mode: number;
    pos: [number, number] | null;
    buildProp: BuildingProperties | null;
    activeBid: string | null;
    activeFid: string | null;
    activeLevel: number | null;
}

const MapComponent: React.FC = () => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<MapboxMap | null>(null);
    const [currentState, setCurrentState] = useState<CurrentState>({ mode: 0, pos: null, buildProp: null, activeBid: null, activeFid: null, activeLevel: null });
    // 건물별 상태는 리렌더링을 유발하지 않도록 ref로 관리
    const buildingStates = useRef<{ [bid: string]: BuildingState }>({});

    // 👇 flyCamera 함수의 mode 매개변수 타입을 우리가 정의한 CameraMode로 지정
const flyCamera = useCallback((mode: CameraMode, center: [number, number], bearing: number | null = null) => {
    const cameraSettings = CONFIG.camera as CameraConfig;
    if (!map.current || !cameraSettings[mode]) return;

    const modeOrSettings = cameraSettings[mode];
    let cameraOptions: CameraOptions; // 최종적으로 사용할 카메라 옵션

    // (수정) modeOrSettings의 타입을 확인하고 안전하게 cameraOptions를 할당합니다.
    if (typeof modeOrSettings === 'string') {
        // modeOrSettings가 'around'나 'above' 같은 문자열인 경우,
        // 이 문자열을 키로 사용하여 실제 옵션 객체를 다시 가져옵니다.
        const settingsKey = modeOrSettings as keyof CameraConfig;
        const resolvedSettings = cameraSettings[settingsKey];
        // 가져온 값이 객체인지 한 번 더 확인하여 안정성을 높입니다.
        if (typeof resolvedSettings === 'object' && resolvedSettings !== null) {
            cameraOptions = resolvedSettings;
        } else {
            // 잘못된 설정일 경우 함수를 중단합니다.
            console.error("Invalid camera configuration for mode:", mode);
            return;
        }
    } else {
        // modeOrSettings가 'reset'처럼 처음부터 객체였던 경우
        cameraOptions = modeOrSettings;
    }

    if (bearing === null) {
        bearing = cameraOptions.bearing ?? 0; // bearing이 없을 경우 기본값 0 사용
    }

    map.current.flyTo({ center, ...cameraOptions, bearing, essential: true });
}, []);

    const hideCampusBase = useCallback(() => {
        if (map.current?.getLayer("campus-3d")) {
            map.current.setLayoutProperty("campus-3d", "visibility", "none");
        }
    }, []);

    const showCampusBase = useCallback(() => {
        if (map.current?.getLayer("campus-3d")) {
            map.current.setLayoutProperty("campus-3d", "visibility", "visible");
        }
    }, []);

    // (수정) 'any' 타입을 제거하고 정확한 리스너를 참조하여 이벤트를 해제합니다.
    const removeFloorsFor = useCallback((bid: string) => {
        if (!map.current) return;
        const st = buildingStates.current[bid];
        if (!st || !st.floorLayerIds) return;

        st.floorLayerIds.forEach(id => {
            if (map.current?.getLayer(id)) {
                // 저장해둔 리스너 함수를 가져와서 정확하게 해당 리스너만 제거합니다.
                const listener = st.listeners[id];
                if (listener) {
                    map.current.off("click", id, listener);
                }
                map.current.removeLayer(id);
            }
        });
        
        if (st.sourceId && map.current.getSource(st.sourceId)) {
            map.current.removeSource(st.sourceId);
        }
        delete buildingStates.current[bid];
    }, []);

    const setFloorOpacities = useCallback((bid: string, selectedLevel: number | null) => {
        if (!map.current) return;
        const st = buildingStates.current[bid];
        if (!st) return;

        st.floorsSpec.forEach(fl => {
            const fid = `${bid}-${fl.level}`;
            const opacity = (selectedLevel === null) ? 1 : (fl.level === selectedLevel ? 1 : 0.3);
            if (map.current?.getLayer(fid)) {
                map.current.setPaintProperty(fid, "fill-extrusion-opacity", opacity);
            }
        });
    }, []);

    const handleFloorClick = useCallback((e: mapboxgl.MapLayerMouseEvent, bid: string, fid: string, level: number, center: [number, number], bearing: number) => {
        e.originalEvent.stopPropagation();
        setCurrentState(prev => ({ ...prev, activeFid: fid, activeLevel: level, mode: 2 }));
        setFloorOpacities(bid, level);
        flyCamera('floor', center, bearing);
    }, [flyCamera, setFloorOpacities]);

    // (수정) 생성된 이벤트 리스너를 buildingStates에 저장합니다.
    const generateFloors = useCallback((bid: string) => {
        if (!map.current) return;
        const st = buildingStates.current[bid];
        if (!st) return;

        const buildFloorsGeoJSON = (coords: number[][], floors: FloorSpec[]): GeoJSON.FeatureCollection<GeoJSON.Polygon> => ({
            type: "FeatureCollection",
            features: floors.map(f => ({
                type: "Feature",
                properties: { ...f },
                geometry: { type: "Polygon", coordinates: [coords] }
            }))
        });

        if (!map.current.getSource(st.sourceId)) {
            map.current.addSource(st.sourceId, {
                type: "geojson",
                data: buildFloorsGeoJSON(st.coords, st.floorsSpec)
            });
        }
        
        const center: [number, number] = JSON.parse(st.properties.center);
        const bearing: number = JSON.parse(st.properties.bearing);

        st.floorsSpec.forEach(fl => {
            const fid = `${bid}-${fl.level}`;
            if (st.floorLayerIds.indexOf(fid) === -1) {
              st.floorLayerIds.push(fid);
            }
            if (map.current?.getLayer(fid)) return;

            map.current?.addLayer({
                id: fid, type: "fill-extrusion", source: st.sourceId,
                filter: ["==", ["get", "level"], fl.level],
                paint: {
                    "fill-extrusion-color": ["get", "color"],
                    "fill-extrusion-base": ["get", "base"],
                    "fill-extrusion-height": ["get", "height"],
                    "fill-extrusion-opacity": 1
                }
            });
            
            // 각 레이어에 대한 클릭 핸들러를 만들고 저장합니다.
            const clickHandler: MapListener = (e) => handleFloorClick(e, bid, fid, fl.level, center, bearing);
            st.listeners[fid] = clickHandler;
            map.current?.on("click", fid, clickHandler);
        });

        setCurrentState(prev => ({ ...prev, activeBid: bid, activeLevel: null }));
    }, [handleFloorClick]);

    // (수정) 건물 상태 객체 생성 시 listeners 속성을 초기화합니다.
    const handleBuildingClick = useCallback((e: mapboxgl.MapLayerMouseEvent) => {
        e.originalEvent.stopPropagation();
        const feature = e.features?.[0];
        if (!feature) return;

        const properties = feature.properties as BuildingProperties;
        if (feature.geometry.type !== 'Polygon') return;
        const ring = feature.geometry.coordinates[0];
        if (!ring) return;

        const bid = properties["@id"];
        Object.keys(buildingStates.current).forEach(b => removeFloorsFor(b));
        
        const lvProp = properties["building:levels"];
        const bmProp = properties["building:basement"];
        
        const autoFloorsArray = (fcount: number, bcount: number, defs: typeof CONFIG.buildingDefaults): FloorSpec[] => {
            const { floorThickness, floorGap, colorPalette, basementPalette } = defs;
            const basement: FloorSpec[] = Array.from({ length: bcount }, (_, i) => {
                const level = -(i + 1);
                const base = level * (floorThickness + floorGap) - floorGap;
                return { level, name: `B${i + 1}F`, base, height: base + floorThickness, color: basementPalette[i % basementPalette.length] };
            });
            const floors: FloorSpec[] = Array.from({ length: fcount }, (_, i) => {
                const level = i + 1;
                const base = (level - 1) * (floorThickness + floorGap);
                return { level, name: `${level}F`, base, height: base + floorThickness, color: colorPalette[i % colorPalette.length] };
            });
            return basement.reverse().concat(floors);
        };
        
        const floorsSpec = autoFloorsArray(lvProp, bmProp, CONFIG.buildingDefaults);
        
        buildingStates.current[bid] = {
            coords: ring,
            floorsSpec,
            floorLayerIds: [],
            sourceId: `${bid}-floors`,
            properties,
            listeners: {} // 리스너 객체 초기화
        };
        
        hideCampusBase();
        generateFloors(bid);
        const center: [number, number] = JSON.parse(properties.center);
        flyCamera('building', center);

        setCurrentState(prev => ({ ...prev, activeBid: bid, buildProp: properties, pos: center, mode: 1 }));
    }, [removeFloorsFor, hideCampusBase, generateFloors, flyCamera]);

    const handleBackgroundClick = useCallback((e: mapboxgl.MapMouseEvent) => {
        if (!map.current) return;
        
        const floorLayers = Object.values(buildingStates.current).flatMap(st => st.floorLayerIds);
        const layers = ['campus-3d'].concat(floorLayers);
        const features = map.current.queryRenderedFeatures(e.point, { layers });

        if (features.length > 0) return;

        if (currentState.mode === 2 && currentState.pos && currentState.activeBid) {
            flyCamera('building', currentState.pos);
            setFloorOpacities(currentState.activeBid, null);
            setCurrentState(prev => ({ ...prev, mode: 1, activeLevel: null, activeFid: null }));
        } else if (currentState.mode === 1) {
            Object.keys(buildingStates.current).forEach(bid => removeFloorsFor(bid));
            showCampusBase();
            flyCamera('reset', CONFIG.map.center as [number, number], 0);
            setCurrentState({ mode: 0, pos: null, buildProp: null, activeBid: null, activeFid: null, activeLevel: null });
        }
    }, [currentState, flyCamera, setFloorOpacities, removeFloorsFor, showCampusBase]);

    useEffect(() => {
        if (map.current || !mapContainer.current) return;

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: CONFIG.map.style,
            center: CONFIG.map.center as [number, number],
            zoom: CONFIG.map.zoom
        });

        map.current.on("load", () => {
            if(!map.current) return;
            map.current.addLayer({ id: "sky", type: "sky", paint: { "sky-type": "atmosphere", "sky-atmosphere-sun": [0, 0], "sky-atmosphere-sun-intensity": 15 }});
            map.current.addSource("campus", { type: "geojson", data: CONFIG.campus.geojsonUrl });
            map.current.addLayer({
                id: "campus-3d", type: "fill-extrusion", source: "campus",
                paint: {
                    "fill-extrusion-color": ["coalesce", ["get", "color"], "#aaaaaa"],
                    "fill-extrusion-base": ["coalesce", ["to-number", ["get", "min_height"]], 0],
                    "fill-extrusion-height": ["case", ["has", "height"], ["to-number", ["get", "height"]], ["has", "building:levels"], ["*", ["to-number", ["get", "building:levels"]], CONFIG.buildingDefaults.floorThickness + CONFIG.buildingDefaults.floorGap], 10],
                    "fill-extrusion-opacity": 0.9
                }
            });
            map.current.on("click", "campus-3d", handleBuildingClick);
            map.current.on("click", handleBackgroundClick);
        });

        return () => {
            map.current?.remove();
        };
    }, [handleBuildingClick, handleBackgroundClick]);

    return (
        <div>
            <div ref={mapContainer} style={{ height: "100vh" }} />
            <div className="ml-control"></div>
        </div>
    );
};

export default MapComponent;