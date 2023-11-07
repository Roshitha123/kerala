import { Component, Injector, Input, OnInit } from '@angular/core';
import { AgricultureMapConstants, BASE_LAYER_LIST, COMMON_LAYER_LIST, COMPONENT_ROUTE_MAPPING, LAYER_TYPES, LOCATIONS_LATLNG, LOCATIONS_ZOOM, MAP_OPTIONS } from '../../constants/agriculture-monitoring-map.constants';
import * as L from 'leaflet';
import { GisdataService } from 'src/app/modules/gis/services/gisdata.service';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { LocationService } from 'src/app/modules/table/common/services/location.service';
import { VlDataService } from 'src/app/modules/shared/shared_services/vl-data.service';
import { AgricultureDashboardDefaultParams, AgricultureDashboardRequiredParams } from '../../constants/agriculture-queryparams.constant';
import { GisUtilsService } from 'src/app/modules/shared/shared_services/gis-utils.service';
import { isNullOrUndefined } from 'src/app/modules/shared/utils-functions/common-utils';
import 'src/assets/js/maplibs/L.control.HtmlLegend.js';
import 'src/assets/map-control/L.Control.ZoomBar.js';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { SatelliteDataService } from '../../modules/satellite-data-processing/satellite-shared/services/satellite-data-service/satellite-data.service';
import { DroughtDataService } from '../../modules/drought/drought-data.service';
import { AgriProjConstants } from '../../constants/agriculture-proj-constants';
import { HttpService } from 'src/app/modules/gis/services/http.service';
import { ToastrService } from 'ngx-toastr';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-gis-agri-map',
  templateUrl: './gis-agri-map.component.html',
  styleUrls: ['./gis-agri-map.component.scss']
})
export class GisAgriMapComponent implements OnInit {

  // Input Global Variables
  @Input() infoboxComponent: any;
  @Input() otherOptions: any;
  @Input() sidebarComponent: any;
  @Input() taskManagerComponent: any;
  @Input() dataTabComponent :any;
  @Input() uploadComponent: any;
  @Input() measurementTool:any;

  // Common Global Variables
  injectedService: any;
  queryParams: any = {};
  agricultureDefaultParams: any;
  paramsSubscription: any;
  spinner: any = false;
  toggleButtons: any = {
    baselayerControl: false,
    overlaylayerControl: false,
    drawTool: false
  }
  toggleButtonsLeft: any = {
    controller: true,
    taskManager: false,
    searchResultController: false,
    infoboxToggle: false,
    dataTabToggle:false,
    FileUpload: false,
    measurementTool:false,
  }
  params: any = {};
  componentType: any;
  dashboardType:any;

  // Map Related Global Variables
  map: any;
  layers: any = {
    baselayers: {},
    overlaylayers: {},
    aoiLayers: {},
    processedLayers: {},

  }
  activeLayers: any = {};
  legendList: any = {};
  htmlNewLegend: any;
  mapId: any;
  selectedCommonLayers: any = '';
  metaInfo: any = {};
  userLocationConfig: any = {};
  componentWiseData: any = {};
  dashboard:any;

  viewLayersData: any = {
    taskUUID: '',
    modelUUID: ''
  }

  showDrawTools: any = false;
  aoiParamsSubscription: any;
  aoiParams: any = {};
  url: any;
  routeParams: any = {
    component: null,
    dashboard: null
  }
  showDataTab:boolean = false;

  measureType:any
  measurementControl: any;
  measureDistance: any;
  measureArea: any;
  saveBool: Boolean = false;
  enableTool: boolean = false;
  updateBoundary: boolean = false;
  currentOutput: any;
  boundaryList: any = [];
  localBoundaryList: any = {};
  multiSelection: boolean = false;

  dataTabSubscription: any;
  enabledTools: any = {
    polygon: false,
    rectangle: false,
    merge: true,
    split: true,
    edit: false,
    multipleBoundarySelection: true,
    cancel: true,
    delete: true
  }

  constructor(
    public gisdataService: GisdataService,
    private injector: Injector,
    private route: ActivatedRoute,
    private vlDataSrv: VlDataService,
    private locationService: LocationService,
    private router: Router,
    public gisUtils: GisUtilsService,
    private modalService: NgbModal,
    private satelliteDataSrv : SatelliteDataService,
    private droughtDataSrv : DroughtDataService,
    private httpService: HttpService,
    private toastrSrv: ToastrService,
  ) {
    this.url = this.router.url.split('?')[0];
    let splitUrl: any = this.url.split('/');
    this.routeParams.component = splitUrl[splitUrl.length - 1];
    this.routeParams.dashboard = splitUrl[splitUrl.length - 2];
   }
   urlConstants: any = environment.url;
  ngAfterViewInit(): void {
    this.revalidateMap();
    return;
  }

  revalidateMap(): void {
    window.dispatchEvent(new Event('resize'));
    if (this.map) {
      setTimeout(() => {
        this.map.invalidateSize();
      }, 200)
    }
  }

  ngOnInit(): void {
    this.mapId = 'map-' + this.otherOptions.mapId;
    this.revalidateMap();
    this.initializeMapContainer();
  }
  initializeMapContainer() {
    setTimeout(() => {
      MAP_OPTIONS['editable'] = true;
      this.map = (L.map as any)(this.mapId, MAP_OPTIONS);
      this.map.setView(LOCATIONS_LATLNG[AgricultureMapConstants.LOCATIONS.INDIA_NEW], LOCATIONS_ZOOM[AgricultureMapConstants.LOCATIONS.INDIA]);
      this.createPanes();
      this.addZoomBar();
      this.getAndSetBaseLayers();
      this.subscribeEvents();
      this.gisUtils.getGisMapComp.next(this);

      /*To access map in any other modules */
      this.satelliteDataSrv.changeGISMap(this.map);
      if(this.routeParams.component == 'drought'){
        this.map.on('click',(e:any) => {
            this.droughtDataSrv.setLatLongs(e.latlng);
        })
      }
    }, 10);

    
  }

  private createPanes() {
    AgricultureMapConstants.PANE_LIST.forEach((pane: any) => {
      this.map.createPane(pane.name);
      this.map.getPane(pane.name).style.zIndex = pane.zindex;
    });
  }

  addZoomBar() {
    let zoomBarControl = new (L as any).control.zoomBar();
    zoomBarControl.addTo(this.map);
  }
  getAndSetBaseLayers() {
    let tileLayers = this.gisdataService.addBaseTileLayers(BASE_LAYER_LIST[LAYER_TYPES.TILE_LAYER], this.map)
    this.layers.baselayers = Object.assign(tileLayers, {});
  }
  private subscribeEvents() {
    this.componentType = this.routeParams.component //this.gisdataService.isEmptyObj(this.route.snapshot.params) ? '' : this.route.snapshot.params['component'];
    this.componentType = this.router.url.split('/').includes('satelliteDataProcessing') ? 'satelliteDataProcessing' : this.componentType;
    this.dashboard = this.router.url.includes('download') ? 'download' : '';
    this.dashboardType = this.dashboard ? this.dashboard : this.router.url.split('?')[0].split('/')[3];
    this.revalidateMap()
    this.selectedCommonLayers = AgricultureMapConstants.DASHBOARD_WISE_COMMON_LAYERS_KEY_MAPPING[this.componentType];
    this.injectedService = this.injector.get(this.otherOptions['serviceType']);
    // getting metaInfo
    let metaInfo: any = localStorage.getItem('metaInfo');
    let metaInfoJson: any = !isNullOrUndefined(metaInfo) ? JSON.parse(metaInfo) : {};
    this.metaInfo = metaInfoJson;
    if (Object.keys(metaInfoJson).length > 0) {
      if (metaInfoJson.hasOwnProperty('userDetailsJson')) {
        this.userLocationConfig = this.formQuerParamsVariables(metaInfoJson.userDetailsJson?.data.location);
        this.setQueryParams(this.userLocationConfig);
      }
    }
    this.paramsSubscription = this.gisUtils.selectedParams.subscribe((params: any) => {
      if (!this.gisdataService.isEmptyObj(params)) {
        let routeParams: any = this.routeParams; //this.gisdataService.getWritableObject(this.route.snapshot.params);
        if (Object.keys(routeParams).length == 0) {
          routeParams = {
            component: 'cropAnalytics',
            dashboard: 'agriculture'
          };
        }
        if ((COMPONENT_ROUTE_MAPPING[params['component']] &&
          COMPONENT_ROUTE_MAPPING[params['component']] == routeParams['component']) || params['component'] == 'satelliteDataProcessing') {
          this.params = JSON.parse(JSON.stringify(params));
          this.revalidateMap();
          this.initMethods();
        }
      }
    });
    this.aoiParamsSubscription = this.gisUtils.aoiSelectedParams.subscribe((params: any) => {
      if (Object.keys(params).length > 0) {
        this.aoiParams = params;
        if (this.otherOptions.hasOwnProperty('aoiFunctionName')) {
          this.injectedService[this.otherOptions.aoiFunctionName](this);
        }
      }
    });

    this.dataTabSubscription = this.gisUtils.toggleSide.subscribe(event => {
      this.toggleButtonsLeft['dataTabToggle'] = event;
    })
  }
  // triggerFunctions() {
  //   this.removeAllLayers();
  //   // this.getAndSetCommonLayers();
  //   // this.gisUtils.selectedFieldData.next({});
  //   this.injectedService.legendData = {};
  //   if (this.injectedService.hasOwnProperty('removeHighLightLayer')) {
  //     this.injectedService.removeHighLightLayer(this);
  //   }
  // }
  removeAllLayers() {
    for (const key in this.layers.overlaylayers) {
      if (this.map.hasLayer(this.layers.overlaylayers[key])) {
        this.map.removeLayer(this.layers.overlaylayers[key]);
      }
      delete this.layers.overlaylayers[key];
    }
  }
  // getAndSetCommonLayers() {
  //   let geoJsonLayersBasedOnView = this.gisdataService.getApplicationBasedLayer(COMMON_LAYER_LIST[AgricultureMapConstants.LOCATIONS[this.selectedCommonLayers]], LAYER_TYPES.GEOJSON_LAYER);
  //   geoJsonLayersBasedOnView = this.formatLayersData(geoJsonLayersBasedOnView);
  //   this.gisdataService.setGEOJSONOverlays(this.map, geoJsonLayersBasedOnView, this.layers, this.otherOptions, this).then((data) => {
  //     this.layers.overlaylayers = Object.assign({}, this.layers.overlaylayers, data);
  //     this.spinner = false;
  //   });

  //   let wmsLayersBasedOnView = this.gisdataService.getApplicationBasedLayer(COMMON_LAYER_LIST[AgricultureMapConstants.LOCATIONS[this.selectedCommonLayers]], LAYER_TYPES.WMS_LAYER);
  //   wmsLayersBasedOnView = this.formatLayersData(wmsLayersBasedOnView);
  //   this.addSrcWiseWMSLayers(wmsLayersBasedOnView);

  //   let vectorLayersBasedOnView = this.gisdataService.getApplicationBasedLayer(COMMON_LAYER_LIST[AgricultureMapConstants.LOCATIONS[this.selectedCommonLayers]], LAYER_TYPES.VECTOR_LAYER);
  //   vectorLayersBasedOnView = this.formatLayersData(vectorLayersBasedOnView);
  //   this.addSrcWiseVECTORLayers(vectorLayersBasedOnView);
  // }
  formatLayersData(layerList: any) {
    for (let layerName in layerList) {
      if (layerList[layerName].layerOptions.cql_filter_value) {
        layerList[layerName].layerOptions.cql_filter = layerList[layerName].layerOptions.cql_filter_value + "='" + this.queryParams.params['pUUID'] + "'";
      }
    }
    return layerList;
  }
  expandOptions(type: any,close?:any)  {
    Object.keys(this.toggleButtons).forEach((key: any) => {
      this.toggleButtons[key] = key == type ? !this.toggleButtons[key] : false;
    });

    Object.keys(this.toggleButtonsLeft).forEach((key: any) => {
      this.toggleButtonsLeft[key] = (key == type) ? !this.toggleButtonsLeft[key] : false;
    });
    if (type == 'baselayerControl' || type == 'overlaylayerControl') {
      this.toggleButtonsLeft.infoboxToggle = false;
    }
    if (type !== 'measurementTool' || close) {
      if (this.measurementControl) {
        this.measurementControl.stopMeasuring();  // Check if measurementControl is defined
      }
      this.measureArea = null;
      this.measureDistance = null;
      this.measureType = null;
    }
  }
  // handleInfoBox(val: any) {
  //   this.revalidateMap();
  //   this.infoboxToggle = !this.infoboxToggle;
  //   if (this.infoboxToggle) {
  //     Object.keys(this.toggleButtons).forEach((key: any) => {
  //       this.toggleButtons[key] = false;
  //     });
  //   }
  // }
  initMethods() {
    this.gisUtils.selectedFieldEvent.next({});
    if (this.params['actionType'] == 'filter') {
      this.removeAllLayers();
      this.removeComponentWiseLayers();
      this.removeHeatMapLayers();
      this.injectedService[this.otherOptions['functionName']](this);
    }

    if(this.routeParams.component == 'drought'){
      this.injectedService[this.otherOptions['functionName']](this);
     }
    this.getAndSetUserLoginBasedLayers();
  }
  removeComponentWiseLayers() {
    for (const key in this.layers.overlaylayers) {
      let layer = this.layers.overlaylayers[key]['options'];
      if (layer['component'] && (layer['component'] == this.params['component'])) {
        if (this.map.hasLayer(this.layers.overlaylayers[key])) {
          this.map.removeLayer(this.layers.overlaylayers[key])
        }
        delete this.layers.overlaylayers[key];
      }
    }
  }
  addSrcWiseWMSLayers(wmsLayersBasedOnView: any) {
    this.layers.overlaylayers = Object.assign({}, this.layers.overlaylayers, this.gisdataService.setWMSOverlays(this.map, wmsLayersBasedOnView, this.layers.overlaylayers));
  }

  addSrcWiseVECTORLayers(vectorLayersBasedOnView: any) {
    this.layers.overlaylayers = Object.assign({}, this.layers.overlaylayers, this.gisdataService.setVECTOROverlays(this.map, vectorLayersBasedOnView, null, this.layers.overlaylayers, this.params));
  }

  addSrcWiseGEOJSONLayers(geoJsonLayersBasedOnView: any) {
    this.gisdataService.setGEOJSONOverlays(this.map, geoJsonLayersBasedOnView, this.layers, this.otherOptions, this).then(data => {
      this.layers.overlaylayers = Object.assign({}, this.layers.overlaylayers, data);
      if (this.params.component && this.params.component != AgricultureMapConstants.COMPONENT.BOUNDARYMANAGEMENT && this.componentType != 'satelliteDataProcessing') {
        this.manageLegend();
      }
    });
  }
  manageLegend() {
    if (!this.gisdataService.isEmptyObj(this.otherOptions.legend))
      this.otherOptions.legend = {};
    for (const key in this.activeLayers) {
      let layer = this.layers.overlaylayers[key];
      if (layer) {
        if (!isNullOrUndefined(layer['options']['hasLegend']) || !isNullOrUndefined(layer['options']['legendName'])) {
          if (this.activeLayers[key]) {
            this.otherOptions.legend[layer['options']['legendName']] = this.legendList[layer['options']['legendName']];
          }
          else {
            for (const i in this.legendList) {
              if (i == layer['options']['legendName']) {
                delete this.otherOptions.legend[i];
              }
            }
          }
        }
      }
      if (this.params.component == 'CROPGROWTH' || this.params.component == 'CROPGROWTHANALYSIS') {
        if (this.params.locationType == 'user-defined') {
          let aoiLayers: any = this.layers.aoiLayers[key];
          if (!isNullOrUndefined(aoiLayers)) {
            if (!isNullOrUndefined(aoiLayers['options']['hasLegend']) || !isNullOrUndefined(aoiLayers['options']['legendName'])) {
              if (this.activeLayers[key]) {
                this.otherOptions.legend[aoiLayers['options']['legendName']] = this.legendList[aoiLayers['options']['legendName']];
              }
            }
          }
        }
      }
    }
    this.addLegend();
  }
  addLegend() {
    this.createLegend();
    let legendData;
    legendData = this.otherOptions.legend;
    let legendValue;
    for (let key in legendData) {
      if (legendData[key]) {
        legendValue = this.getLegendData(legendData[key]);
        this.htmlNewLegend.addLegend(legendValue);
      }
    }
  }

  createLegend() {
    this.removeUpdatedLegend();
    this.htmlNewLegend = new (L as any).Control.HtmlLegendForVisibility({
      position: 'bottomright',
      collapseSimple: false,
      detectStretched: false,
      collapsedOnInit: false,
      showByDefault: true
    });
    if (!isNullOrUndefined(this.htmlNewLegend)) {
      this.map.addControl(this.htmlNewLegend);
    }
  }

  removeUpdatedLegend() {
    if (this.htmlNewLegend) {
      this.map.removeControl(this.htmlNewLegend);
      this.htmlNewLegend.clearLegend();
    }
  }

  getLegendData(data: any) {
    let legend: any = {
      name: data.Units,
      elements: []
    }
    let isTrue = 1;

    if (isTrue == 1 && data.colorValues && data.colorValues.length > 0) {
      let html: any = ``, color;
      color = '#ffffff';
      for (let key = 0; key < data.colorValues.length; key++) {
        if (data.colorValues[key]['image']) {
          // html += `<p>${data.colorValues[key].max}</p>`;
          // html = data.HTML ? data.HTML : "<p><img src='" + data.colorValues[key]['image'] + "'/></p>";
          html = data.HTML ? data.HTML : `
          <div class='d-flex gap-2'>
          <img class='d-block h-200px' src="${data.colorValues[key]['image']}"/>
            <div class='h-200px d-flex flex-column justify-content-between'>
              <p class='m-0'>${data.colorValues[key].max}</p>
              <p class='m-0'>${data.colorValues[key].min}</p>
            </div>
        </div>
          `;
          // html += `<p>${data.colorValues[key].min}</p>`;
          // if (data.colorValues[key]['image'] === '../../../../../assets/imgs/visibilityDashboards/miTanks/MITankPolygon.png') {
          // } else {
          //   html += `<div><img  src='${data.colorValues[key].image}'></><p>${data.colorValues[key].text}</p></div>`;
          // }
        } else {
          html += `<div></span><span style='background-color: ${data.colorValues[key].backgroundColor}'></span><p>${data.colorValues[key].text}</p></div>`;
        }
      }
      legend['elements'].push({ html: html });

    } else if (data.HTML || data.image) {
      let html = data.HTML ? data.HTML : "<img src='" + data.image + "'/>";
      legend.elements.push({ html: html });
    }
    return legend;
  }

  ngOnDestroy() {
    if (this.paramsSubscription) {
      this.paramsSubscription.unsubscribe();
    }
    if (this.aoiParamsSubscription) {
      this.aoiParamsSubscription.unsubscribe();
    }
    if(this.dataTabSubscription) {
      this.dataTabSubscription.unsubscribe();
    }
  }

  openTaskManager() {
    const modalRef = this.modalService.open(this.taskManagerComponent, {
      size: 'xl',
      centered: true,
      windowClass: 'modal-dark'
    });
    modalRef.componentInstance.gisMapComp = this;
  }
  formQuerParamsVariables(parsedLocInfo?: any) {
    let locationInfo: any = {
      country: '',
      state: '',
      district: '',
      block: '',
      village: '',
      location: ''
    }
    let types: any = {
      pType: '',
      cType: ''
    }
    if (Object.keys(parsedLocInfo).length > 0) {
      if (parsedLocInfo.hasOwnProperty('country')) {
        if (parsedLocInfo.country.length > 0) {
          locationInfo.country = this.gisUtils.titleCase(parsedLocInfo.country[0].countryName) + '##' + parsedLocInfo.country[0].countryUUID;
          locationInfo.state = '';
          locationInfo.district = '';
          locationInfo.block = '';
          locationInfo.village = '';
          locationInfo.location = locationInfo.country;
          types.pType = 'COUNTRY';
          types.cType = 'STATE';
          if (parsedLocInfo.country[0].hasOwnProperty('state')) {
            if (parsedLocInfo.country[0].state.length > 0) {
              locationInfo.country = this.gisUtils.titleCase(parsedLocInfo.country[0].countryName) + '##' + parsedLocInfo.country[0].countryUUID;
              locationInfo.state = this.gisUtils.titleCase(parsedLocInfo.country[0].state[0].stateName) + '##' + parsedLocInfo.country[0].state[0].stateUUID;
              locationInfo.district = '';
              locationInfo.block = '';
              locationInfo.village = '';
              locationInfo.location = locationInfo.country + '&' + locationInfo.state;
              types.pType = 'STATE';
              types.cType = 'DISTRICT';
              if (parsedLocInfo.country[0].state[0].hasOwnProperty('district')) {
                if (parsedLocInfo.country[0].state[0].district.length > 0) {
                  locationInfo.country = this.gisUtils.titleCase(parsedLocInfo.country[0].countryName) + '##' + parsedLocInfo.country[0].countryUUID;
                  locationInfo.state = this.gisUtils.titleCase(parsedLocInfo.country[0].state[0].stateName) + '##' + parsedLocInfo.country[0].state[0].stateUUID;
                  locationInfo.district = this.gisUtils.titleCase(parsedLocInfo.country[0].state[0].district[0].districtName) + '##' + parsedLocInfo.country[0].state[0].district[0].districtUUID;
                  locationInfo.block = '';
                  locationInfo.village = '';
                  locationInfo.location = locationInfo.country + '&' + locationInfo.state + '&' + locationInfo.district;
                  types.pType = 'DISTRICT';
                  types.cType = 'BLOCK';
                  if (parsedLocInfo.country[0].state[0].district[0].hasOwnProperty('block')) {
                    if (parsedLocInfo.country[0].state[0].district[0].block.length > 0) {
                      locationInfo.country = this.gisUtils.titleCase(parsedLocInfo.country[0].countryName) + '##' + parsedLocInfo.country[0].countryUUID;
                      locationInfo.state = this.gisUtils.titleCase(parsedLocInfo.country[0].state[0].stateName) + '##' + parsedLocInfo.country[0].state[0].stateUUID;
                      locationInfo.district = this.gisUtils.titleCase(parsedLocInfo.country[0].state[0].district[0].districtName) + '##' + parsedLocInfo.country[0].state[0].district[0].districtUUID;
                      locationInfo.block = this.gisUtils.titleCase(parsedLocInfo.country[0].state[0].district[0].block[0].blockName) + '##' + parsedLocInfo.country[0].state[0].district[0].block[0].blockUUID;
                      locationInfo.village = '';
                      locationInfo.location = locationInfo.country + '&' + locationInfo.state + '&' + locationInfo.district + '&' + locationInfo.block;
                      types.pType = 'BLOCK';
                      types.cType = 'VILLAGE';
                      if (parsedLocInfo.country[0].state[0].district[0].block[0].hasOwnProperty('village')) {
                        if (parsedLocInfo.country[0].state[0].district[0].block[0].village.length > 0) {
                          locationInfo.country = this.gisUtils.titleCase(parsedLocInfo.country[0].countryName) + '##' + parsedLocInfo.country[0].countryUUID;
                          locationInfo.state = this.gisUtils.titleCase(parsedLocInfo.country[0].state[0].stateName) + '##' + parsedLocInfo.country[0].state[0].stateUUID;
                          locationInfo.district = this.gisUtils.titleCase(parsedLocInfo.country[0].state[0].district[0].districtName) + '##' + parsedLocInfo.country[0].state[0].district[0].districtUUID;
                          locationInfo.block = this.gisUtils.titleCase(parsedLocInfo.country[0].state[0].district[0].block[0].blockName) + '##' + parsedLocInfo.country[0].state[0].district[0].block[0].blockUUID;
                          locationInfo.village = this.gisUtils.titleCase(parsedLocInfo.country[0].state[0].district[0].villageName) + '##' + parsedLocInfo.country[0].state[0].district[0].block[0].village[0].villageUUID;
                          locationInfo.location = locationInfo.country + '&' + locationInfo.state + '&' + locationInfo.district + '&' + locationInfo.block + '&' + locationInfo.village;
                          types.pType = 'VILLAGE';
                          types.cType = 'FARM';
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    return { locationInfo, types };
  }

  
  setQueryParams(userLocationConfig: any) { // setting params on the basis of metaInfo
    this.route.queryParamMap.subscribe((params: Params) => {
      this.queryParams = {};
      for (const param in params) {
        if (params.hasOwnProperty(param)) {
          this.queryParams[param] = params[param];
        }
      }
      this.agricultureDefaultParams = this.vlDataSrv.deepClone(AgricultureDashboardDefaultParams);
      const mergedParams = this.vlDataSrv.deepMerge(this.agricultureDefaultParams, this.queryParams);
      if(!isNullOrUndefined(userLocationConfig.locationInfo[userLocationConfig.types.pType.toLowerCase()])){
        let currentLocations: any = userLocationConfig.locationInfo[userLocationConfig.types.pType.toLowerCase()].split('##');
        mergedParams['dashboardType'] = 'gis';
        mergedParams['pUUID'] = currentLocations[1]
        mergedParams['locName'] = currentLocations[0]
        mergedParams['locType'] = userLocationConfig.types.pType;
        mergedParams['pEUUID'] = userLocationConfig.locationInfo.country.split('##')[1];
        mergedParams['location'] = userLocationConfig.locationInfo.location;
      }
      if (!this.locationService.verifyAllParamsPresent(this.queryParams, JSON.parse(JSON.stringify(AgricultureDashboardRequiredParams)))) {
        this.router.navigate(['.'], {
          relativeTo: this.route,
          queryParams: mergedParams,
          queryParamsHandling: 'merge'
        });
      } else {
        this.removeAllLayers();
        this.initMethods();
      }
    });
  }
  async getAndSetUserLoginBasedLayers() {
    // let pType: any = this.queryParams.params.locType;
    // let locTypeMapping: any = this.getLocationAndAPIMapping();
    if (this.queryParams.params.pUUID != '') {
      let dashboadWiseCommonLayers: any = COMMON_LAYER_LIST[AgricultureMapConstants.LOCATIONS[this.selectedCommonLayers]];
      if (Object.keys(dashboadWiseCommonLayers).length > 0 && !this.otherOptions?.dontRenderCommonLayers) {
        this.addLocationWiseLayers(this.queryParams.params, dashboadWiseCommonLayers);
      }
    }
    // let pUUID: any = this.queryParams.params.pUUID;
    // if (this.queryParams.params.pUUID != '') {
    //   let response: any = await this.getHighlightedLayer(locTypeMapping, pType, pUUID);
    //   let data: any = new L.GeoJSON(response.data);
    //   let bounds: any = data.getBounds();
    //   if (Object.keys(bounds).length > 0) {
    //     this.map.fitBounds(data.getBounds());
    //   }
    //   this.map.addLayer(this.layers.overlaylayers[pType]);
    //   this.spinner = false;
    // }
  }
  // getLocationAndAPIMapping() {
  //   let locTypeMapping: any = {
  //     [AgricultureMapConstants.LOCATIONS.STATE]: {
  //       url: 'agri_all_india_states',
  //       uuidColName: 'uuid',
  //       pane: 'state',
  //       workspaceName: 'krishidss',
  //       locType: 'STATE',
  //       environment_url_key: 'KRISHI_DSS_GEOSERVER_URL',
  //     },
  //     [AgricultureMapConstants.LOCATIONS.DISTRICT]: {
  //       url: 'agri_all_india_districts',
  //       uuidColName: 'district_uuid',
  //       pane: 'state',
  //       workspaceName: 'krishidss',
  //       locType: 'DISTRICT',
  //       environment_url_key: 'KRISHI_DSS_GEOSERVER_URL'
  //     },
  //     [AgricultureMapConstants.LOCATIONS.BLOCK]: {
  //       url: 'agri_all_india_blocks',
  //       uuidColName: 'block_uuid',
  //       pane: 'district',
  //       workspaceName: 'krishidss',
  //       locType: 'BLOCK',
  //       environment_url_key: 'KRISHI_DSS_GEOSERVER_URL'
  //     },
  //     [AgricultureMapConstants.LOCATIONS.VILLAGE]: {
  //       url: 'agri_all_india_villages',
  //       uuidColName: 'village_uuid',
  //       pane: 'block',
  //       workspaceName: 'krishidss',
  //       locType: 'VILLAGE',
  //       environment_url_key: 'KRISHI_DSS_GEOSERVER_URL'
  //     }
  //   };
  //   return locTypeMapping;
  // }
  // getHighlightedLayer(locTypeMapping: any, pType: any, locUUID: any) {
  //   this.spinner = true;
  //   let response: any = {
  //     isError: false
  //   };
  //   let styleObj = {
  //     weight: 2.7,
  //     color: '#00FFFF',
  //     fillOpacity: 0,
  //     pane: locTypeMapping[pType].pane,
  //   };
  //   let filter = locTypeMapping[pType].uuidColName + "='" + locUUID + "'";
  //   let urlKey: any = locTypeMapping[pType].environment_url_key;
  //   let promise = new Promise((resolve, reject) => {
  //     this.gisdataService.getLayerWithFilter(locTypeMapping[pType].url, filter, locTypeMapping[pType].workspaceName, urlKey, 'WFS').subscribe((data: any) => {
  //       this.layers.overlaylayers[pType] = (L as any).geoJSON(data, {
  //         style: styleObj,
  //         interactive: false
  //       });
  //       response['data'] = data;
  //       resolve(response);
  //     });
  //   });
  //   return promise
  // }
  addLocationWiseLayers(queryParams: any, dashboadWiseCommonLayers: any) {
    let layersList: any = {};
    if (!isNullOrUndefined(queryParams.locType)) {
      layersList[this.gisUtils.titleCase(queryParams.locType)] = dashboadWiseCommonLayers[this.gisUtils.titleCase(queryParams.locType) + ' Boundaries'];
      let geoJsonLayersBasedOnView = this.gisdataService.getApplicationBasedLayer(layersList, LAYER_TYPES.GEOJSON_LAYER);
      geoJsonLayersBasedOnView = this.formatLayersData(geoJsonLayersBasedOnView);
      this.addSrcWiseGEOJSONLayers(geoJsonLayersBasedOnView);
      this.addLocationWiseWMSLayers(queryParams);
    }
  }
  addLocationWiseWMSLayers(queryParams: any) {
    let wmsLayerList: any = {};
    let currentLocType: any = queryParams.locType;
    let hie: any = AgriProjConstants.DROUGHT_BOUNDARY_HIE;
    let nextLevel: any = hie[hie.indexOf(currentLocType) + 1];
    let layerName: any = this.gisUtils.titleCase(nextLevel) + ' Boundary';
    wmsLayerList[layerName] = COMMON_LAYER_LIST[AgricultureMapConstants.LOCATIONS.INDIA][layerName];
    // wmsLayerList[layerName + ' Labels'] = COMMON_LAYER_LIST[AgricultureMapConstants.LOCATIONS.INDIA][layerName + ' Labels'];
    if(layerName != 'Farm Boundary'){
      let wmsLayersBasedOnView = this.gisdataService.getApplicationBasedLayer(wmsLayerList, LAYER_TYPES.WMS_LAYER);
      wmsLayersBasedOnView = this.formatWmsLayersData(wmsLayersBasedOnView, queryParams);
      this.addSrcWiseWMSLayers(wmsLayersBasedOnView);
    }
  }
  formatWmsLayersData(layerList: any, queryParams?: any) {
    if (!isNullOrUndefined(queryParams)) {
      for (let layerName in layerList) {
        if (layerList[layerName].layerOptions.cql_filter_value) {
          let uuid: any = this.getLocationUUID(queryParams, layerList[layerName].layerOptions);
          layerList[layerName].layerOptions.cql_filter = layerList[layerName].layerOptions.cql_filter_value + "='" + uuid + "'";
        }
      }
      return layerList;
    }
  }
  getLocationUUID(queryParams: any, options: any) {
    let allLocations: any = queryParams.location.split('&');
    let uuid: any = '';
    if (options.layer_name == 'State Boundary') {
      uuid = allLocations[1].split('##')[1]
    } else if (options.layer_name == 'District Boundary' || options.layer_name == 'District Boundary Labels') {
      uuid = allLocations[1].split('##')[1]
    } else if (options.layer_name == 'Block Boundary') {
      uuid = allLocations[2].split('##')[1]
    } else if (options.layer_name == 'Village Boundary') {
      uuid = allLocations[3].split('##')[1]
    }
    //  else if (options.layer_name == 'Village Farm Level Boundary') {
    //   uuid = allLocations[4].split('##')[1]
    // }
    return uuid;
  }
  routeToWorkspace(level: any) {
    let params: any = {};
    Object.keys(this.queryParams).forEach((key) => {
      if (key != 'params') {
        params[key] = this.queryParams[key];
      }
    });
    params['cartSummaryLevel'] = level;
    params['cartUUID'] = '';
    this.router.navigate(['agri', 'satelliteDataProcessing', 'download', 'cart-summary', params])
  }
  removeHeatMapLayers() {
    if (Object.keys(this.layers.aoiLayers)) {
      Object.keys(this.layers.aoiLayers).forEach((layerName: any) => {
        const layer: any = this.layers.aoiLayers[layerName].options;
        if (layer.component && layer.component == this.params.component) {
          if (this.map.hasLayer(this.layers.aoiLayers[layerName])) {
            this.map.removeLayer(this.layers.aoiLayers[layerName]);
          }
          delete this.layers.aoiLayers[layerName];
        }
      });
    }
  }

removeControl(event:any) {
  this.measurementControl = event.measureControl;
  this.measureType = event.measureType;
  this.measureArea = event.measureArea;
  this.measureDistance = event.measureDistance;
}
getDrawnLayer(event: any) {
  let geom = event.toGeoJSON().geometry;
  if (geom.type == 'Polygon' || geom.type == 'MultiPolygon') {
    this.currentOutput = { 'type': 'polygon', 'output': geom, 'layer': event };
    this.saveBool = true;
  }

}
multiBoundarySelection(event: any) {
  console.log("event::9999 ",event)
  this.multiSelection = event;
  let layers = this.layers.clickedBoundaryLayers;
  console.log("layers::check:::: ",layers)
  Object.keys(layers).forEach((key) => {
    if (this.map.hasLayer(layers[key])) {
      this.map.removeLayer(layers[key]);
    }
    this.layers.clickedBoundaryLayers = {};
    this.localBoundaryList = {};
    this.boundaryList = [];
  })
}

drawEventEnable(event: any) {
  console.log("drawEvent", event);
}
drawtoolOutput(event: any) {
  this.saveBool = true;
  this.currentOutput = event;
}

drawToolCurrentSelection(event: any) {
  if (event && (event == 'draw' || event == 'split' || event == 'merge')) {
    this.enableTool = true;
  } else if (event == 'cancel') {
    this.enableTool = false;
    this.saveBool = false;
    this.layers.clickedBoundaryLayers = {};
    this.localBoundaryList = {};
    this.boundaryList = [];
    this.currentOutput = {};
    this.updateBoundary = false;
  } else if (event == 'edit') {
    this.enableTool = true;
    this.updateBoundary = true;
  } else if (event == 'delete') {
    this.currentOutput = { 'type': 'delete', 'output': [], 'layer': undefined }
    this.submit();
  } else {
    this.enableTool = false;
  }
}
submit() {
  let layers = this.layers.clickedBoundaryLayers;
  let deletedUUIDs: any = [];
  let geoms = [];
  let item = '';
  Object.keys(layers).forEach((key) => {
    deletedUUIDs.push(key);
    item = key;
  });
  if (this.currentOutput.type == 'merge') {
    let geom = JSON.stringify(this.currentOutput.output.geometry);
    geoms.push(geom);
  } else if (this.currentOutput.type == 'split') {
    let features = this.currentOutput.output.features
    for (var i = 0; i < features.length; i++) {
      geoms.push(JSON.stringify(features[i].geometry));
    }
  } else if (this.currentOutput.type == 'polygon') {
    geoms.push(JSON.stringify(this.currentOutput.output));
    deletedUUIDs = [];
  } else if (this.currentOutput.type == 'delete') {
    geoms = [];
  }
  let postData = {
    "deleteUUIDs": deletedUUIDs,
    "taskUUID": this.viewLayersData.taskUUID,
    "modelUUID": this.viewLayersData.modelUUID,
    "geoJsons": geoms
  }
  this.httpService.mergeSplitBoundary(postData).subscribe((response:any) => {
    if (response.result) {
      if (this.currentOutput.type == 'delete') {
        this.toastrSrv.success('Deleted Successfully');
      } else {
        this.toastrSrv.success('Saved Successfully');
      }
      this.enableTool = false;
      this.saveBool = false;
      if (this.currentOutput.layer && this.map.hasLayer(this.currentOutput.layer)) {
        this.map.removeLayer(this.currentOutput.layer)
      };
      let layers = this.layers.clickedBoundaryLayers;
      Object.keys(layers).forEach((key) => {
        if (this.map.hasLayer(layers[key])) {
          this.map.removeLayer(layers[key]);
        }
      })
      this.currentOutput = {};
      this.layers.clickedBoundaryLayers = {};
      this.localBoundaryList = {};
      this.boundaryList = [];
      this.reRenderBoundaryLayer();
      this.gisUtils.clearDrawtoolOptions.next(true);
    } else {
      this.toastrSrv.error(response.message)
    }
  })
}

async reRenderBoundaryLayer(){
  for(let eachGroup in this.layers.processedLayers){
    let layer = this.layers.processedLayers[eachGroup]['Final Output'];
    console.log(layer)
    if(layer?.layerConfig?.options?.drawtoolenabled){
      if(this.map.hasLayer(layer.layerConfig))
        this.map.removeLayer(layer.layerConfig);
      let finalLayer:any = await this.addFinalBoundaryLayer(layer.layerConfig, layer);
      finalLayer['options'] = layer.layerConfig.options;
      layer.layerConfig = finalLayer;
      let obj: any = {
        group: eachGroup,
        layer: layer
      }
      this.gisUtils.getReRenderedData.next(obj);
      console.log(layer.layerConfig)
      this.map.addLayer(layer.layerConfig);
      this.map.fitBounds(layer.layerConfig.getBounds())
    }
  }
}
addFinalBoundaryLayer(layerConfig:any, layerObj: any){
  let layerOptions = layerConfig?.options
  let url  = this.urlConstants.KRISHI_DSS_GEOSERVER_URL+'krishidss/ows?service=WFS&version=1.0.0&request=GetFeature&typeName='+layerOptions.layers+'&maxFeatures=50000&outputFormat=application%2Fjson' + "&cql_filter="+layerOptions.cql_filter
  console.log(layerOptions)
  let that = this;
  return new Promise((resolve, reject) => {
    this.httpService.getGeoJsonLayer(url).subscribe((geodata:any) =>{
      layerObj.data = JSON.parse(JSON.stringify(geodata));
      let layer =  new L.GeoJSON(geodata, {
        
        onEachFeature: function (feature, layer) {
          layer.on({
            click: (e: L.LayerEvent) => {
              console.log("layer click",e)
              that.gisUtils.boundaryClickEvent.next(e);
            },
      
          })
        },
        style :  {
          color: '#7cFC00',
          weight: 2,
          fillColor: 'transparent',
          fillOpacity: 1
        }
      })

      resolve(layer);
    })
  })
}
updatePolyBoundary() {
  let layers = this.layers.clickedBoundaryLayers;
  let geom = JSON.stringify(this.boundaryList[0].toGeoJSON().geometry);
  let uuid = '';
  Object.keys(layers).forEach((key) => {
    uuid = key;
  });
  let postData = {
    "polygon1": {
      "polygonUUID": uuid,
      "geoJson": geom
    }
  };
  this.httpService.updateBoundary(postData).subscribe((response) => {
    if (response.result) {
      this.toastrSrv.success('Updated Successfully');
      this.enableTool = false;
      this.updateBoundary = false;
      if (this.map.hasLayer(this.boundaryList[0])) {
        this.map.removeLayer(this.boundaryList[0])
      }
      this.currentOutput = {};
      this.layers.clickedBoundaryLayers = {};
      this.localBoundaryList = {};
      this.boundaryList = [];
    } else {
      this.toastrSrv.error(response.message)
    }
  })
}  

}

