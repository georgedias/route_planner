import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { DataSource } from 'typeorm'

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  /** Reports API and PostGIS availability without exposing connection details. */
  @Get()
  async getHealth() {
    try {
      const [database] = await this.dataSource.query(
        'SELECT PostGIS_Full_Version() AS postgis_version',
      )
      return {
        status: 'ok',
        service: 'endurance-route-planner-api',
        database: 'connected',
        postgis: Boolean(database?.postgis_version),
      }
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        service: 'endurance-route-planner-api',
        database: 'unavailable',
      })
    }
  }
}
