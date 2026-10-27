package pe.edu.vallegrande.caneteseguro.fleet.domain.port.out;

import pe.edu.vallegrande.caneteseguro.fleet.domain.model.MaintenanceOrder;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.Collection;

/**
 * Puerto de salida para persistencia desacoplada de órdenes de mantenimiento.
 * Convención en inglés según estándar DatabaseStorage (HEX-02).
 */
public interface MaintenanceOrderRepositoryPort {

    Mono<MaintenanceOrder> findById(String id);

    Mono<MaintenanceOrder> findByOrderCode(String orderCode);

    Flux<MaintenanceOrder> findByResourceId(String resourceId);

    Flux<MaintenanceOrder> findByEntityId(String entityId);

    Flux<MaintenanceOrder> findByOrderStatus(String orderStatus);

    Flux<MaintenanceOrder> findAll();

    Mono<MaintenanceOrder> save(MaintenanceOrder order);

    Mono<Boolean> existsByResourceIdAndOrderStatusNotIn(String resourceId, Collection<String> statuses);
}
