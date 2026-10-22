import request from './request'
import type { IpCity, WeatherCity, WeatherData } from '../types/weather'

export const getWeatherByCity = (city: string) =>
  request.get<never, WeatherData>('/weather', { params: { city }, silent: true })

export const getWeatherByLocation = (longitude: number, latitude: number) =>
  request.get<never, WeatherData>('/weather/locate', {
    params: { longitude, latitude },
    silent: true,
  })

export const getIpCity = () => request.get<never, IpCity>('/weather/ip-city', { silent: true })

export const searchWeatherCities = (keyword: string) =>
  request.get<never, WeatherCity[]>('/weather/cities', { params: { keyword }, silent: true })
