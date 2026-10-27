package pe.edu.vallegrande.caneteseguro.fleet.domain.port.in;

import pe.edu.vallegrande.caneteseguro.fleet.application.dto.request.AssignWorkshopRequest;
import pe.edu.vallegrande.caneteseguro.fleet.application.dto.request.CancelOrderRequest;
import pe.edu.vallegrande.caneteseguro.fleet.application.dto.request.CreateMaintenanceOrderRequest;
import pe.edu.vallegrande.caneteseguro.fleet.application.dto.request.TechnicalDischargeRequest;
import pe.edu.vallegrande.caneteseguro.fleet.application.dto.request.UpdateMaintenanceOrderRequest;
import pe.edu.vallegrande.caneteseguro.fleet.domain.model.MaintenanceOrder;
import pe.edu.vallegrande.caneteseguro.fleet.domain.vo.OrderStatus;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Puerto de entrada (Inbound Port) en inglés para el ciclo de mantenimiento.
 */
public interface MaintenanceOrderUseCase {

    Flux<MaintenanceOrder> findAll();

    Mono<MaintenanceOrder> findById(String id);

    Mono<MaintenanceOrder> findByCode(String code);

    Flux<MaintenanceOrder> findByResource(String resourceId);

    Flux<MaintenanceOrder> findByEntity(String entityId);

    Flux<MaintenanceOrder> findByStatus(OrderStatus status);

    Mono<MaintenanceOrder> create(CreateMaintenanceOrderRequest request, String token, String reportedByDni);

    Mono<MaintenanceOrder> update(String id, UpdateMaintenanceOrderRequest request);

    Mono<MaintenanceOrder> assignWorkshop(String id, AssignWorkshopRequest request);

    Mono<MaintenanceOrder> startRepair(String id);

    Mono<MaintenanceOrder> passToQualityControl(String id);

    Mono<MaintenanceOrder> issueTechnicalDischarge(String id, TechnicalDischargeRequest request, String token, String approvedByDni);

    Mono<MaintenanceOrder> cancel(String id, CancelOrderRequest request, String token);
}
