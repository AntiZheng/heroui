export interface WeatherLive {
  province: string
  city: string
  adcode: string
  weather: string
  temperature: string
  winddirection: string
  windpower: string
  humidity: string
  reporttime: string
}

export interface WeatherCast {
  date: string
  week: string
  dayweather: string
  nightweather: string
  daytemp: string
  nighttemp: string
  daywind: string
  nightwind: string
  daypower: string
  nightpower: string
}

export interface WeatherForecast {
  city: string
  province: string
  adcode: string
  reporttime: string
  casts: WeatherCast[]
}

export interface WeatherData {
  live: WeatherLive
  forecast: WeatherForecast
}

export interface IpCity {
  province: string
  city: string
  adcode: string
}

export interface WeatherCity {
  name: string
  adcode: string
  level: string
}
